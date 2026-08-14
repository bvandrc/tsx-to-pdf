import { readFile } from 'node:fs/promises'
import { PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import type { Browser } from 'playwright'

import { version } from '../package.json' with { type: 'json' }
import type { ResolvedConfig } from './config.ts'

/**
 * The software that made the PDF, which is what `/Producer` and `/Creator`
 * name — `<product> <version>` is the convention every other generator follows,
 * from `Skia/PDF m141` to `pdfTeX-1.40.25`.
 */
const PRODUCER = `tsx-to-pdf ${version}`

/**
 * Loaded on demand, so `--no-pdf` needs no browser at all. Playwright is the
 * project's own dependency: printing needs its CLI to fetch a browser, which
 * only works when it is installed there rather than nested under this package.
 */
const playwright = async (): Promise<typeof import('playwright')> => {
  try {
    return await import('playwright')
  } catch (error) {
    throw new Error(
      'Printing needs Playwright, which is yours to install:\n' +
        '  pnpm add -D playwright\n' +
        '  pnpm exec playwright install chromium\n' +
        'Or pass --no-pdf to render only the HTML and CSS.',
      { cause: error }
    )
  }
}

/**
 * Reads the PDF at `pdfPath` for inspection, or `undefined` if there is
 * nothing there yet.
 */
export const loadPreviousPdf = async (
  pdfPath: string
): Promise<PDFDocument | undefined> => {
  try {
    return await PDFDocument.load(await readFile(pdfPath), {
      // Otherwise the load itself synthesises the very fields callers are
      // trying to read back — pdf-lib's default stamps a fresh
      // `/CreationDate` on load whenever one isn't already present, which is
      // exactly the case a `setDate: false` PDF is always in.
      updateMetadata: false,
    })
  } catch {
    return undefined
  }
}

/**
 * Chromium, configured as the build prints with. Exported so the dev server can
 * measure in the same browser: a different build lays text out differently, and
 * the point of the preview is that it agrees with the PDF.
 */
export const launchBrowser = async (): Promise<Browser> => {
  const { chromium } = await playwright()

  /**
   * Escape hatch for environments whose Chromium build predates the one
   * Playwright expects. Unset everywhere `playwright install` has run.
   */
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH

  return chromium.launch(
    /**
     * Full Chromium, not the smaller `chromium-headless-shell`. Since Playwright
     * 1.49 a plain headless launch resolves to the shell, and it lays text out
     * around 1.7% taller — enough to push a full page onto a second one, on the
     * machine that happens to have the shell installed and not the one beside
     * it. `channel` is what pins the real browser, and it is also the one the
     * dev server previews in.
     *
     * The two are mutually exclusive: an explicit path names the binary itself.
     */
    executablePath ? { executablePath } : { channel: 'chromium' }
  )
}

/** Every font resource across the document, as `/Type0`, `/Type3` and friends. */
const getFontSubtypes = (pdf: PDFDocument): string[] =>
  pdf.getPages().flatMap((page) => {
    const fonts = page.node.Resources()?.lookup(PDFName.of('Font'), PDFDict)

    return fonts
      ? [...fonts.entries()].map(([, ref]) =>
          String(pdf.context.lookup(ref, PDFDict)?.get(PDFName.of('Subtype')))
        )
      : []
  })

/**
 * Prints the page with headless Chromium, honouring the compiled `@page` rule
 * rather than Chromium's own default page box. Throws if the result runs past
 * `maxPages`, where the config sets one.
 *
 * Takes the URL of the written page rather than a string of markup.
 */
export const buildPdf = async (
  pageUrl: string,
  {
    maxPages,
    page: sheet,
    checkPdfFontTypes = true,
    author,
    setDate,
  }: ResolvedConfig
): Promise<Uint8Array> => {
  const browser = await launchBrowser()

  try {
    const page = await browser.newPage()
    const failed: string[] = []
    page.on('requestfailed', (request) => failed.push(request.url()))

    await page.goto(pageUrl, { waitUntil: 'load' })
    // Layout is only final once the fonts are parsed.
    await page.evaluate(() => document.fonts.ready)

    // A stylesheet or font that failed to load would reflow the whole document
    // into a plausible-looking but wrong PDF, so refuse to produce one.
    if (failed.length > 0) {
      throw new Error(`Resources failed to load: ${failed.join(', ')}`)
    }

    const pdf = await PDFDocument.load(
      await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
        // Carries the headings, lists and reading order into the file as
        // structure. Without it a parser only sees text at coordinates and has
        // to infer the order, which is where multi-column layouts scramble.
        tagged: true,
        outline: true,
      })
    )

    const pageCount = pdf.getPageCount()
    if (maxPages !== undefined && pageCount > maxPages) {
      throw new Error(
        `Rendered to ${pageCount} pages, but must fit on ${maxPages} at ` +
          `${sheet.width} × ${sheet.height}. Trim the document, tighten its ` +
          'stylesheet, or raise maxPages.'
      )
    }

    if (!pdf.catalog.has(PDFName.of('StructTreeRoot'))) {
      throw new Error(
        'PDF has no structure tree, so Chromium ignored tagged: true.'
      )
    }

    // Chromium falls back to Type3 glyph procedures for any font it cannot
    // embed — a variable font, for one — and extractors read those least well.
    if (checkPdfFontTypes && getFontSubtypes(pdf).includes('/Type3')) {
      throw new Error(
        'Fonts embedded as Type3, which extractors read poorly. Chromium does ' +
          'this when it cannot embed the font — check the stylesheet points at ' +
          'static instances rather than a variable font. Set ' +
          'checkPdfFontTypes: false to build anyway.'
      )
    }

    // Chromium and pdf-lib both stamp a date here on their own — Chromium's
    // print and pdf-lib's load each set it to the moment they ran, so left
    // alone the file would carry two different "now"s that are really just
    // build noise. `setDate` decides what replaces them: the actual build
    // time, a given instant, or nothing, for a build that has to be
    // reproducible — a byte-identical rebuild of unchanged source, which a
    // live date can never be twice.
    if (setDate) {
      const date = setDate === true ? new Date() : setDate
      pdf.setCreationDate(date)
      pdf.setModificationDate(date)
    } else {
      const info = pdf.context.lookup(pdf.context.trailerInfo.Info, PDFDict)
      info?.delete(PDFName.of('CreationDate'))
      info?.delete(PDFName.of('ModDate'))
    }
    pdf.setProducer(PRODUCER)
    pdf.setCreator(PRODUCER)

    if (author) {
      pdf.setAuthor(author)
    }

    // pdf-lib derives a fresh /ID from the current time on save unless one is set.
    const id = PDFHexString.of('0'.repeat(32))
    pdf.context.trailerInfo.ID = pdf.context.obj([id, id])

    return await pdf.save({ useObjectStreams: false })
  } finally {
    await browser.close()
  }
}
