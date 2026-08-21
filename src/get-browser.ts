/**
 * Loaded on demand, so a build that skips PDF and image output needs no
 * browser at all. Playwright is the project's own dependency: generating a
 * PDF or image needs its CLI to fetch a browser, which only works when it is
 * installed there rather than nested under this package.
 */
const playwright = async (): Promise<typeof import('playwright')> => {
  try {
    return await import('playwright')
  } catch (error) {
    throw new Error(
      'PDF and image generation need Playwright, which is yours to install:\n' +
        '  pnpm add -D playwright\n' +
        '  pnpm exec playwright install chromium\n' +
        'Or pass --no-pdf and drop --png/--jpg to render only the HTML and CSS.',
      { cause: error }
    )
  }
}

/**
 * Launches headless Chromium and loads the rendered page, ready to generate a
 * PDF or a screenshot. Shared so a build that wants both only launches one
 * browser. The caller owns closing the returned browser.
 */
export const getBrowser = async ({ pageUrl }: { pageUrl: string }) => {
  const { chromium } = await playwright()

  /**
   * Escape hatch for environments whose Chromium build predates the one
   * Playwright expects. Unset everywhere `playwright install` has run.
   */
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH

  const browser = await chromium.launch(
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

  try {
    const page = await browser.newPage()
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

    return { browser, page }
  } catch (error) {
    await browser.close()
    throw error
  }
}
