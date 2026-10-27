import { parseArgs } from 'node:util'

import { build } from './build.ts'
import { findConfig, loadConfig } from './config.ts'
import { serve } from './dev-server.tsx'

const USAGE = `tsx-to-pdf <command>

Commands:
  build            Render the document to its output directory
  dev              Serve a live preview at the page's exact size

Options:
  --config <path>  Config file. Defaults to tsx-to-pdf.config.ts in the cwd
  --no-pdf         build only: skip the PDF, so no browser is needed
  --md             build only: also write the Markdown
  --png            build only: also write a full-page PNG screenshot
  --jpg            build only: also write a full-page JPG screenshot
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
      png: { type: 'boolean' },
      jpg: { type: 'boolean' },
      port: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  const [command] = positionals

  if (!command || values.help) {
    console.info(USAGE)
    return
  }

  const config = await loadConfig(findConfig(values.config))

  switch (command) {
    case 'build': {
      const written = await build(config, {
        pdf: !values['no-pdf'],
        markdown: values.md,
        png: values.png,
        jpg: values.jpg,
      })
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
