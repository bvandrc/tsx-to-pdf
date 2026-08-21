import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mapValues } from 'es-toolkit'

import { buildPage, copyAssets } from './build-html.tsx'
import { buildImage } from './build-image.ts'
import { buildMarkdown } from './build-markdown.ts'
import { buildPdf, loadPreviousPdf } from './build-pdf.ts'
import type { ResolvedConfig } from './config.ts'
import { getBrowser } from './get-browser.ts'

const outputFiles = ({ outDir, name }: ResolvedConfig) =>
  mapValues(
    { PDF: 'pdf', HTML: 'html', CSS: 'css', MD: 'md', PNG: 'png', JPG: 'jpg' },
    (extension) =>
      join(
        outDir,
        // HTML and CSS share html/ — the stylesheet's relative URL depends on
        // sitting beside the page it styles. The rest are each a single file,
        // so they land in outDir directly rather than a folder of their own.
        extension === 'html' || extension === 'css' ? 'html' : '',
        `${name}.${extension}`
      )
  )

/** Which optional outputs to also write, beyond the page and its stylesheet. */
type BuildOptions = {
  /**
   * Generate the PDF. Needs a browser.
   * @default true
   */
  pdf?: boolean
  /**
   * Also write the document's text as Markdown. Content only — the layout the
   * classes describe has no equivalent and is dropped.
   * @default false
   */
  markdown?: boolean
  /**
   * Also write a full-page PNG screenshot of the same render the PDF is
   * generated from. Needs a browser, shared with `pdf` when both are on.
   * @default false
   */
  png?: boolean
  /**
   * Also write a full-page JPG screenshot of the same render the PDF is
   * generated from. Needs a browser, shared with `pdf` when both are on.
   * @default false
   */
  jpg?: boolean
}

/**
 * Renders the configured document to `outDir`, and returns what it wrote.
 */
export const build = async (
  config: ResolvedConfig,
  { pdf = true, markdown = false, png = false, jpg = false }: BuildOptions = {}
): Promise<string[]> => {
  const paths = outputFiles(config)

  // Everywhere this call might write, so their directories exist up front —
  // the page and its stylesheet always, the rest only when asked for.
  const outputs = [
    paths.HTML,
    paths.CSS,
    ...(markdown ? [paths.MD] : []),
    ...(pdf ? [paths.PDF] : []),
    ...(png ? [paths.PNG] : []),
    ...(jpg ? [paths.JPG] : []),
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

  let pdfNeeded = pdf
  let pdfSetDate = config.setDate

  if (pdf) {
    const previousPdf = await loadPreviousPdf(paths.PDF)
    const prevDate = previousPdf?.getCreationDate()

    // Generating again — a browser launch — is pure waste when the existing
    // PDF is already what this build would produce. Only `author` and
    // `setDate` land in the file outside of the rendered content itself:
    // `checkPdfFontTypes` and `maxPages` are validations against that
    // content, so an unchanged document already has the same answer for
    // both without checking.
    const upToDate =
      sourceUnchanged &&
      previousPdf != null &&
      // author matches
      (previousPdf.getAuthor() || undefined) === config.author &&
      // date matches — any previously stamped date is still a legitimate
      // "now" for a document that hasn't changed since, so `true` alone is
      // enough; `false` or a fixed `Date` are only up to date if the file
      // already carries exactly that.
      (config.setDate === true ||
        (config.setDate === false
          ? prevDate === undefined
          : prevDate?.getTime() === config.setDate.getTime()))

    pdfNeeded = !upToDate
    // Only true (the default, "stamp now") has a previous date worth reusing
    // on an unchanged document — false and a fixed Date are already
    // deterministic on their own. The previous PDF is the source of truth
    // for that date rather than tracking it separately.
    pdfSetDate =
      sourceUnchanged && config.setDate === true && prevDate
        ? prevDate
        : config.setDate
  }

  // One browser for PDF (when it actually needs regenerating) and both image
  // formats, so asking for more than one doesn't pay for a second Chromium launch.
  if (pdfNeeded || png || jpg) {
    const { browser, page } = await getBrowser({
      pageUrl: pathToFileURL(paths.HTML).href,
    })

    try {
      if (pdfNeeded) {
        await writeFile(
          paths.PDF,
          await buildPdf(page, { ...config, setDate: pdfSetDate })
        )
      }

      if (png) {
        await writeFile(paths.PNG, await buildImage(page, 'png'))
      }

      if (jpg) {
        await writeFile(paths.JPG, await buildImage(page, 'jpg'))
      }
    } finally {
      await browser.close()
    }
  }

  return outputs
}
