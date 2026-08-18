import type { PdfBrowser } from './config.ts'
import { launchPlaywright, resolvePlaywright } from './playwright-driver.ts'
import { launchPuppeteer, resolvePuppeteer } from './puppeteer-driver.ts'

/**
 * The slice of Playwright's and Puppeteer's own `Page` type this package
 * calls — both satisfy it structurally, which is what lets `getBrowser`
 * hand back one type regardless of which drove the browser.
 */
export type Page = {
  on: (
    event: 'requestfailed',
    listener: (request: { url: () => string }) => unknown
  ) => unknown
  goto: (url: string, options: { waitUntil: 'load' }) => Promise<unknown>
  evaluate: <T>(fn: () => T) => Promise<T>
  pdf: (options: Record<string, unknown>) => Promise<Uint8Array>
  $: (
    selector: string
  ) => Promise<{
    screenshot: (options: { type: 'png' | 'jpeg' }) => Promise<Uint8Array>
  } | null>
}

type Browser = {
  newPage: () => Promise<Page>
  close: () => Promise<void>
}

/**
 * `undefined` means the package itself could not be found — the caller
 * should try the next driver. Anything `launch` throws past that point is a
 * real, actionable failure (missing browser binary, bad executablePath,
 * ...), so it is left to propagate rather than being folded into the same
 * "not installed" case.
 */
const attemptPlaywright = async (
  executablePath?: string
): Promise<Browser | undefined> => {
  const playwright = await resolvePlaywright().catch(() => undefined)
  return playwright && launchPlaywright(playwright, executablePath)
}

const attemptPuppeteer = async (
  executablePath?: string
): Promise<Browser | undefined> => {
  const puppeteer = await resolvePuppeteer().catch(() => undefined)
  return puppeteer && launchPuppeteer(puppeteer, executablePath)
}

const ATTEMPTS = {
  playwright: attemptPlaywright,
  puppeteer: attemptPuppeteer,
} satisfies Record<PdfBrowser, (executablePath?: string) => Promise<Browser | undefined>>

const INSTALL_HINTS = {
  playwright:
    '  pnpm add -D playwright\n  pnpm exec playwright install chromium',
  puppeteer: '  pnpm add -D puppeteer',
} satisfies Record<PdfBrowser, string>

/**
 * Both drivers are the consuming project's own dependency: generating a PDF
 * or image needs one on *your* `node_modules`, which only works when it is
 * installed there rather than nested under this package. Without a
 * `browser` config, tries each in turn so either being installed is enough.
 */
const launchBrowser = async (
  browser: PdfBrowser | undefined,
  executablePath?: string
): Promise<Browser> => {
  const candidates = browser
    ? [browser]
    : (Object.keys(ATTEMPTS) as PdfBrowser[])

  for (const candidate of candidates) {
    const launched = await ATTEMPTS[candidate](executablePath)
    if (launched) {
      return launched
    }
  }

  throw new Error(
    browser
      ? `PDF and image generation need ${browser}, which is yours to install:\n${INSTALL_HINTS[browser]}\nOr pass --no-pdf and drop --png/--jpg to render only the HTML and CSS.`
      : 'PDF and image generation need Playwright or Puppeteer, neither of which is installed:\n' +
          `${INSTALL_HINTS.playwright}\nor\n${INSTALL_HINTS.puppeteer}\n` +
          'Or pass --no-pdf and drop --png/--jpg to render only the HTML and CSS.'
  )
}

/**
 * Launches headless Chromium (via Playwright or Puppeteer) and loads the
 * rendered page, ready to generate a PDF or a screenshot. Shared so a build
 * that wants both only launches one browser. The caller owns closing the
 * returned browser.
 */
export const getBrowser = async ({
  pageUrl,
  browser,
}: {
  pageUrl: string
  browser?: PdfBrowser
}): Promise<{ browser: Browser; page: Page }> => {
  /**
   * Escape hatch for environments whose Chromium build predates the one the
   * driver expects. Unset everywhere `playwright install` has run, or under
   * Puppeteer's own downloaded browser.
   */
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH

  const launched = await launchBrowser(browser, executablePath)

  try {
    const page = await launched.newPage()
    const failed: string[] = []
    page.on('requestfailed', (request) => failed.push(request.url()))

    await page.goto(pageUrl, { waitUntil: 'load' })
    // Layout is only final once the fonts are parsed.
    await page.evaluate(() => document.fonts.ready)

    // A stylesheet or font that failed to load would reflow the whole document
    // into a plausible-looking but wrong result, so refuse to produce one.
    if (failed.length > 0) {
      throw new Error(`Resources failed to load: ${failed.join(', ')}`)
    }

    return { browser: launched, page }
  } catch (error) {
    await launched.close()
    throw error
  }
}
