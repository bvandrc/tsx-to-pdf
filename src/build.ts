import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mapValues, omit } from 'es-toolkit'

import { buildPage, copyAssets } from './build-html.tsx'
import { buildPdf } from './build-pdf.ts'
import type { ResolvedConfig } from './config.ts'

const outputFiles = ({ outDir, name }: ResolvedConfig) =>
  mapValues({ PDF: 'pdf', HTML: 'html', CSS: 'css' }, (extension) =>
    join(
      outDir,
      // The stylesheet sits in html/ beside the page it styles; the other two
      // are named after the directory they land in.
      extension === 'css' ? 'html' : extension,
      `${name}.${extension}`
    )
  )

/**
 * Renders the configured document to `outDir`, and returns what it wrote.
 * With `pdf: false` it skips the browser, which is enough to tell whether the
 * source changed.
 */
export const build = async (
  config: ResolvedConfig,
  { pdf = true }: { pdf?: boolean } = {}
): Promise<string[]> => {
  const paths = outputFiles(config)

  const { html, css } = await buildPage({
    config,
    stylesheet: `./${config.name}.css`,
  })

  await Promise.all(
    Object.values(paths).map((path) =>
      mkdir(dirname(path), { recursive: true })
    )
  )

  await writeFile(paths.HTML, html)
  await writeFile(paths.CSS, css)

  // Flattened into the page's own directory, so that directory carries what it
  // needs wherever it is copied to, and the stylesheet's relative URLs hold.
  await copyAssets(config, dirname(paths.HTML), [
    basename(paths.HTML),
    basename(paths.CSS),
  ])

  if (pdf) {
    await writeFile(
      paths.PDF,
      await buildPdf(pathToFileURL(paths.HTML).href, config)
    )
  }

  return Object.values(pdf ? paths : omit(paths, ['PDF']))
}
