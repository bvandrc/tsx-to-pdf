import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mapValues } from 'es-toolkit'

import { buildPage, copyAssets } from './build-html.tsx'
import { buildMarkdown } from './build-markdown.ts'
import { buildPdf } from './build-pdf.ts'
import type { ResolvedConfig } from './config.ts'

const outputFiles = ({ outDir, name }: ResolvedConfig) =>
  mapValues({ PDF: 'pdf', HTML: 'html', CSS: 'css', MD: 'md' }, (extension) =>
    join(
      outDir,
      // The stylesheet sits in html/ beside the page it styles; the rest are
      // named after the directory they land in.
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

  // The page and its stylesheet always; the other two only when asked for, so
  // neither leaves an empty directory behind when it is off.
  const written = [
    paths.HTML,
    paths.CSS,
    ...(config.markdown ? [paths.MD] : []),
    ...(pdf ? [paths.PDF] : []),
  ]

  const { html, css } = await buildPage({
    config,
    stylesheet: `./${config.name}.css`,
  })

  await Promise.all(
    written.map((path) => mkdir(dirname(path), { recursive: true }))
  )

  await writeFile(paths.HTML, html)
  await writeFile(paths.CSS, css)

  // Flattened into the page's own directory, so that directory carries what it
  // needs wherever it is copied to, and the stylesheet's relative URLs hold.
  await copyAssets(config, dirname(paths.HTML), [
    basename(paths.HTML),
    basename(paths.CSS),
  ])

  if (config.markdown) {
    await writeFile(paths.MD, await buildMarkdown(html))
  }

  if (pdf) {
    await writeFile(
      paths.PDF,
      await buildPdf(pathToFileURL(paths.HTML).href, config)
    )
  }

  return written
}
