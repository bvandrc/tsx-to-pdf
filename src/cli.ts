import { parseArgs } from 'node:util'

import { build } from './build.ts'
import { findConfigFile, loadConfigFile } from './config.ts'
import { serve } from './dev-server.tsx'

const USAGE = `tsx-to-pdf <command>

Commands:
  build            Render the document to its output directory
  dev              Serve a live preview at the page's exact size

Options:
  --config <path>  Config file. Defaults to tsx-to-pdf.config.ts in the cwd
  --[no-]pdf       Write the PDF. --no-pdf needs no browser
  --[no-]md        Write the Markdown
  --[no-]png       Write a full-page PNG screenshot
  --[no-]jpg       Write a full-page JPG screenshot
  --port <n>       The port dev serves on

Each of the last five sets its config key for this run: pdf, markdown, png,
jpg, or port.
`

const main = async (args: string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    allowNegative: true, // allow for --X and --no-X , for every boolean
    options: {
      config: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      // The outputs, each named for the extension it writes.
      pdf: { type: 'boolean' },
      md: { type: 'boolean' },
      png: { type: 'boolean' },
      jpg: { type: 'boolean' },
      port: { type: 'string' },
    },
  })

  const [command] = positionals
  const { config: configOption, help, port, md, ...outputs } = values

  if (!command || help) {
    console.info(USAGE)
    return
  }

  // Checked by the config's own schema, so `--port abc` fails the way
  // `port: 'abc'` would. A flag left off leaves the config's choice as it is.
  const config = await loadConfigFile(findConfigFile(configOption), {
    ...outputs,
    ...(md !== undefined && { markdown: md }), // The one flag not named after its key.
    ...(port !== undefined && { port: Number(port) }),
  })

  switch (command) {
    case 'build': {
      const written = await build(config)
      console.info(`Wrote ${written.join(', ')}`)
      return
    }

    case 'dev': {
      serve(config)
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
