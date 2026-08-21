/**
 * Loaded on demand, so a Puppeteer-only consumer needs no Playwright
 * installed at all. It is the consuming project's own dependency: printing
 * needs its CLI to fetch a browser, which only works when it is installed
 * there rather than nested under this package.
 *
 * Split from `launchPlaywright` so a caller trying both drivers can tell
 * "not installed" (this rejects) apart from "installed but failed to
 * launch" (`launchPlaywright` rejects) — the latter needs Playwright's own
 * error surfaced, not a generic install hint.
 */
export const resolvePlaywright = (): Promise<typeof import('playwright')> =>
  import('playwright')

export const launchPlaywright = (
  playwright: typeof import('playwright'),
  executablePath?: string
) => {
  const { chromium } = playwright

  return chromium.launch(
    /**
     * Full Chromium, not the smaller `chromium-headless-shell`. Since
     * Playwright 1.49 a plain headless launch resolves to the shell, and it
     * lays text out around 1.7% taller — enough to push a full page onto a
     * second one, on the machine that happens to have the shell installed
     * and not the one beside it. `channel` is what pins the real browser,
     * and it is also the one the dev server previews in.
     *
     * The two are mutually exclusive: an explicit path names the binary
     * itself.
     */
    executablePath ? { executablePath } : { channel: 'chromium' }
  )
}
