import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mapValues } from 'es-toolkit'

import { buildPage, copyAssets } from './build-html.tsx'
import { buildMarkdown } from './build-markdown.ts'
import { buildPdf, loadPreviousPdf } from './build-pdf.ts'
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

  // Read ahead of overwriting them, to tell if the source changed and a PDF rebuild is needed.
  const [previousHtml, previousCss] = await Promise.all(
    [paths.HTML, paths.CSS].map((p) =>
      readFile(p, 'utf8').catch(() => undefined)
    )
  )

  const { html, css } = await buildPage({
    config,
    stylesheet: `./${config.name}.css`,
  })

  const sourceUnchanged = previousHtml === html && previousCss === css

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
    const previousPdf = await loadPreviousPdf(paths.PDF)
    const prevDate = previousPdf?.getCreationDate()

    const upToDate =
      sourceUnchanged &&
      previousPdf != null &&
      // author matches
      (previousPdf.getAuthor() || undefined) === config.author &&
      // date matches
      (config.setDate === true ||
        (config.setDate === false
          ? prevDate === undefined
          : prevDate?.getTime() === config.setDate.getTime()))

    if (!upToDate) {
      await writeFile(
        paths.PDF,
        await buildPdf(pathToFileURL(paths.HTML).href, {
          ...config,
          setDate:
            sourceUnchanged && config.setDate === true && prevDate
              ? prevDate
              : config.setDate,
        })
      )
    }
  }

  return outputs
}
