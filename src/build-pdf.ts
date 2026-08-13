import { PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'

import type { ResolvedConfig } from './config.ts'

/** Fixed instant so repeated builds of unchanged sources produce identical bytes. */
const EPOCH = new Date(0)

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

/** Every font resource across the document, as `/Type0`, `/Type3` and friends. */
const fontSubtypes = (pdf: PDFDocument): string[] =>
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
  { maxPages, page: sheet, checkPdfFontTypes, producer }: ResolvedConfig
): Promise<Uint8Array> => {
  const { chromium } = await playwright()

  const browser = await chromium.launch({
    /**
     * Full Chromium, deliberately, not the smaller `chromium-headless-shell`:
     * the shell measures text ~1.4px wider, so the PDF would no longer match
     * what the dev server shows in a real browser.
     *
     * Escape hatch for environments whose Chromium build predates the one
     * Playwright expects. Unset everywhere `playwright install` has run.
     */
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  })

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
    if (checkPdfFontTypes && fontSubtypes(pdf).includes('/Type3')) {
      throw new Error(
        'Fonts embedded as Type3, which extractors read poorly. Chromium does ' +
          'this when it cannot embed the font — check the stylesheet points at ' +
          'static instances rather than a variable font. Set ' +
          'checkPdfFontTypes: false to build anyway.'
      )
    }

    // Strip what Chromium varies per run — timestamps and the document ID — so
    // an unchanged document rebuilds to identical bytes. A staleness check in CI
    // relies on that to tell a real change from a rerun.
    pdf.setCreationDate(EPOCH)
    pdf.setModificationDate(EPOCH)
    pdf.setProducer(producer)
    pdf.setCreator(producer)

    // pdf-lib derives a fresh /ID from the current time on save unless one is set.
    const id = PDFHexString.of('0'.repeat(32))
    pdf.context.trailerInfo.ID = pdf.context.obj([id, id])

    return await pdf.save({ useObjectStreams: false })
  } finally {
    await browser.close()
  }
}
