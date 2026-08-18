/**
 * Loaded on demand, so a Playwright-only consumer needs no Puppeteer
 * installed at all. It is the consuming project's own dependency, for the
 * same reason Playwright is: printing needs it on *your* `node_modules`,
 * not nested under this package.
 *
 * Split from `launchPuppeteer` so a caller trying both drivers can tell
 * "not installed" (this rejects) apart from "installed but failed to
 * launch" (`launchPuppeteer` rejects) — the latter needs Puppeteer's own
 * error surfaced, not a generic install hint.
 */
export const resolvePuppeteer = (): Promise<typeof import('puppeteer')> =>
  import('puppeteer')

export const launchPuppeteer = (
  puppeteer: typeof import('puppeteer'),
  executablePath?: string
) =>
  // Puppeteer's own download is Chrome for Testing — already the full
  // browser Playwright's `channel: 'chromium'` has to ask for separately —
  // so no channel needs pinning here.
  puppeteer.launch(executablePath ? { executablePath } : {})
