import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mapValues } from 'es-toolkit'

import { buildPage, copyAssets } from './build-html.tsx'
import { buildMarkdown } from './build-markdown.ts'
import { buildPdf, isPdfUpToDate, reusePreviousDate } from './build-pdf.ts'
import type { ResolvedConfig } from './config.ts'

const outputFiles = ({ outDir, name }: ResolvedConfig) =>
  mapValues({ PDF: 'pdf', HTML: 'html', CSS: 'css', MD: 'md' }, (extension) =>
    join(
      outDir,
      // HTML and CSS share html/ — the stylesheet's relative URL depends on
      // sitting beside the page it styles. PDF and Markdown are each a single
      // file, so they land in outDir directly rather than a folder of their own.
      extension === 'html' || extension === 'css' ? 'html' : '',
      `${name}.${extension}`
    )
  )

/** Which optional outputs to also write, beyond the page and its stylesheet. */
type BuildOptions = {
  /**
   * Print to PDF. Needs a browser — turn it off to skip that, which is enough
   * to tell whether the source changed.
   * @default true
   */
  pdf?: boolean
  /**
   * Also write the document's text as Markdown. Content only — the layout the
   * classes describe has no equivalent and is dropped.
   * @default false
   */
  markdown?: boolean
}

/**
 * Renders the configured document to `outDir`, and returns what it wrote.
 */
export const build = async (
  config: ResolvedConfig,
  { pdf = true, markdown = false }: BuildOptions = {}
): Promise<string[]> => {
  const paths = outputFiles(config)

  // Everywhere this call might write, so their directories exist up front —
  // the page and its stylesheet always, the other two only when asked for.
  const outputs = [
    paths.HTML,
    paths.CSS,
    ...(markdown ? [paths.MD] : []),
    ...(pdf ? [paths.PDF] : []),
  ]

  const { html, css } = await buildPage({
    config,
    stylesheet: `./${config.name}.css`,
  })

  // Read ahead of overwriting them, so a rebuild of an unchanged document can
  // tell it did not change and either reuse the PDF's previous date or skip
  // printing it again entirely.
  const [previousHtml, previousCss] = await Promise.all([
    readFile(paths.HTML, 'utf8').catch(() => undefined),
    readFile(paths.CSS, 'utf8').catch(() => undefined),
  ])
  const unchanged = previousHtml === html && previousCss === css

  await Promise.all(
    outputs.map((path) => mkdir(dirname(path), { recursive: true }))
  )

  await writeFile(paths.HTML, html)
  await writeFile(paths.CSS, css)

  // Flattened into the page's own directory, so that directory carries what it
  // needs wherever it is copied to, and the stylesheet's relative URLs hold.
  await copyAssets(config, dirname(paths.HTML), [
    basename(paths.HTML),
    basename(paths.CSS),
  ])

  if (markdown) {
    await writeFile(paths.MD, await buildMarkdown(html))
  }

  if (pdf) {
    // A launch of Chromium to reproduce a PDF already sitting there correctly
    // is pure waste, so an unchanged document skips it outright rather than
    // only reusing its date.
    const upToDate = unchanged && (await isPdfUpToDate(paths.PDF, config))

    if (!upToDate) {
      const setDate = unchanged
        ? await reusePreviousDate(paths.PDF, config.setDate)
        : config.setDate

      await writeFile(
        paths.PDF,
        await buildPdf(pathToFileURL(paths.HTML).href, { ...config, setDate })
      )
    }
  }

  return outputs
}
