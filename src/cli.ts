import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { register } from 'tsx/esm/api'

import { build } from './build.ts'
import { findConfig, loadConfig } from './config.ts'
import { serve } from './dev-server.tsx'
import { jsxTsconfig } from './tsconfig.ts'

const USAGE = `tsx-to-pdf <command>

Commands:
  build            Render the document to its output directory
  dev              Serve a live preview at the printed page size

Options:
  --config <path>  Config file. Defaults to tsx-to-pdf.config.ts in the cwd
  --no-pdf         build only: skip the PDF, so no browser is needed
  --md, --no-md    build only: write the Markdown, or don't, whatever the config says
  --port <n>       dev only: overrides the configured port
`

const main = async (args: string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      'no-pdf': { type: 'boolean' },
      md: { type: 'boolean' },
      'no-md': { type: 'boolean' },
      port: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  const [command] = positionals

  if (!command || values.help) {
    console.info(USAGE)
    return
  }

  // Found before registering, since locating it only touches the filesystem
  // while loading it may need TypeScript.
  const configPath = findConfig(values.config)

  // Lets the config and the document be TypeScript without the project having
  // to compile them first. Node strips type annotations natively but cannot
  // parse JSX — `<div/>` is a syntax error to it — so the document needs a real
  // transform. This is only ever applied to the project's own files; ours ship
  // compiled. The JSX settings are pinned on top of whatever it already has, so
  // a project needs no tsconfig, and nothing in an existing one has to be right.
  register({ tsconfig: await jsxTsconfig(dirname(configPath)) })

  const config = await loadConfig(configPath)

  switch (command) {
    case 'build': {
      // Either flag wins over the config, the way `--port` does for `dev`.
      const markdown = values.md ?? (values['no-md'] ? false : config.markdown)

      const written = await build(
        { ...config, markdown },
        { pdf: !values['no-pdf'] }
      )
      console.info(`Wrote ${written.join(', ')}`)
      return
    }

    case 'dev': {
      serve(values.port ? { ...config, port: Number(values.port) } : config)
      return
    }

    default:
      throw new Error(`Unknown command ${JSON.stringify(command)}.\n\n${USAGE}`)
  }
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
