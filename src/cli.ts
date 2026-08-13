import { dirname } from 'node:path'
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
  --port <n>       dev only: overrides the configured port
`

/** The value after `flag`, or undefined. */
const option = (argv: string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag)

  return index === -1 ? undefined : argv[index + 1]
}

const main = async (argv: string[]): Promise<void> => {
  const [command] = argv

  if (!command || command === '--help' || command === '-h') {
    console.info(USAGE)
    return
  }

  // Found before registering, since locating it only touches the filesystem
  // while loading it may need TypeScript.
  const configPath = findConfig(option(argv, '--config'))

  // Lets the config and the document be TypeScript without the project having
  // to compile them first. Node strips type annotations natively but cannot
  // parse JSX — `<div/>` is a syntax error to it — so the document needs a real
  // transform. This is only ever applied to the project's own files; ours ship
  // compiled. The JSX settings are pinned on top of whatever it already has, so
  // a project needs no tsconfig, and nothing in an existing one has to be right.
  register({ tsconfig: await jsxTsconfig(dirname(configPath)) })

  const config = await loadConfig(configPath)

  if (command === 'build') {
    const written = await build(config, { pdf: !argv.includes('--no-pdf') })
    console.info(`Wrote ${written.join(', ')}`)
    return
  }

  if (command === 'dev') {
    const port = option(argv, '--port')
    serve(port ? { ...config, port: Number(port) } : config)
    return
  }

  throw new Error(`Unknown command ${JSON.stringify(command)}.\n\n${USAGE}`)
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
