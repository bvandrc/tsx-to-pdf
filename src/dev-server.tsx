import { watch } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { dirname, extname, join, sep } from 'node:path'
import { debounce, noop } from 'es-toolkit'
import { PDFDocument } from 'pdf-lib'
import type { Browser } from 'playwright'

import { buildPage, buildStylesheet } from './build-html.tsx'
import { launchBrowser } from './build-pdf.ts'
import type { ResolvedConfig } from './config.ts'

/** Shared by the route and the client that subscribes to it. */
const LIVERELOAD = '/livereload'

/** Enough to serve what a document links: the build itself needs no such guess. */
const CONTENT_TYPES = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
} as const

const getContentType = (file: string): string =>
  (CONTENT_TYPES as Record<string, string>)[extname(file)] ??
  'application/octet-stream'

/** CSS defines a pixel as 1/96in and a point as 1/72in, so this is exact. */
const PT_PER_PX = 72 / 96

/**
 * Runs in the page: how much height the content occupies, and how much one sheet
 * has. `--page-height` is measured with a probe rather than parsed, because it
 * may be in any CSS unit.
 *
 * The content is measured from where its children end rather than from the box
 * around them — `.page` has the sheet as its `min-height`, so its own height
 * says nothing about a document that has room to spare.
 */
const measureSheet = () => {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;visibility:hidden;height:var(--page-height)'
  document.body.append(probe)
  const sheet = probe.getBoundingClientRect().height
  probe.remove()

  const content = [...document.querySelectorAll('.page')].reduce(
    (total, page) => {
      const { top } = page.getBoundingClientRect()
      const bottom = [...page.children].reduce(
        (lowest, child) =>
          Math.max(lowest, child.getBoundingClientRect().bottom),
        top
      )

      // Padding is the page's margin, so the content is only clear of the sheet
      // with the bottom one still below it.
      return (
        total +
        (bottom - top) +
        Number.parseFloat(getComputedStyle(page).paddingBottom)
      )
    },
    0
  )

  return { content, sheet }
}

/**
 * Reports how the document paginates, in the terminal on every rebuild — the
 * length `buildPdf` asserts on, but while you are editing rather than once the
 * build has already failed.
 *
 * The page count is printed rather than measured, so it accounts for the break
 * rules the document sets; the overflow beside it comes from the laid-out
 * height, and is what there is to trim. A forced break makes the document
 * longer without overflowing anything, so the two are reported apart.
 */
const reportLength = async (
  browser: Browser,
  pageUrl: string,
  maxPages: number
): Promise<void> => {
  const page = await browser.newPage()

  try {
    await page.goto(pageUrl, { waitUntil: 'load' })
    // Layout is only final once the fonts are parsed, as in buildPdf.
    await page.evaluate(() => document.fonts.ready)

    const { content, sheet } = await page.evaluate(measureSheet)

    // No sheet to measure against: the server served its error page rather than
    // the document, and it says what went wrong itself.
    if (sheet === 0) return

    const pdf = await PDFDocument.load(
      await page.pdf({ preferCSSPageSize: true, printBackground: true })
    )
    const pageCount = pdf.getPageCount()

    const over = content - sheet * maxPages
    // Sub-pixel slack: a document that exactly fills the sheet rounds either way.
    const overflow =
      over > 0.5
        ? `${over.toFixed(1)}px / ${(over * PT_PER_PX).toFixed(1)}pt to trim`
        : 'no overflow — a break rule, not length'

    if (pageCount > maxPages) {
      console.warn(
        `${pageCount} pages, past maxPages: ${maxPages} — ${overflow}.`
      )
      return
    }

    console.info(
      `${pageCount}/${maxPages} pages, ` +
        `${(-over).toFixed(1)}px / ${(-over * PT_PER_PX).toFixed(1)}pt to spare.`
    )
  } finally {
    await page.close()
  }
}

/**
 * Serves the document at its exact printed dimensions on a page-like backdrop, so
 * the preview is the PDF rather than an approximation of it.
 *
 * Nothing is compiled up front — every request builds, so a reload cannot serve
 * a stale page or stale CSS.
 */
export const serve = (config: ResolvedConfig): void => {
  const { assetsDir, entryPath, maxPages, name, port } = config
  const contentDir = dirname(entryPath)
  const stylesheet = `/${name}.css`

  const clients = new Set<ServerResponse>()

  /**
   * Newest mtime beside the document, which is what `loadContent` is keyed on.
   * Keying on the files rather than on a watcher event means a missed filesystem
   * notification still can't serve a stale render.
   */
  const contentRevision = async (): Promise<number> => {
    const siblings = await readdir(contentDir)
    const stats = await Promise.all(
      siblings.map((sibling) => stat(join(contentDir, sibling)))
    )

    return Math.max(...stats.map(({ mtimeMs }) => mtimeMs))
  }

  const server = createServer((req, res) => {
    const url = req.url ?? '/'

    if (url === LIVERELOAD) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }

    if (url === stylesheet) {
      buildStylesheet(config)
        .then((css) => {
          res.writeHead(200, { 'Content-Type': 'text/css' })
          res.end(css)
        })
        .catch((error: unknown) => {
          res.writeHead(500)
          res.end(String(error))
        })
      return
    }

    // Anything else is an asset. The stylesheet's relative URLs resolve against
    // its own path, so `./fonts/x.woff2` arrives as `/fonts/x.woff2` — the path
    // it has in the assets directory, and beside the page once the build copies
    // it.
    if (url !== '/') {
      // Nothing to serve when the document configures no assets.
      if (!assetsDir) {
        res.writeHead(404)
        res.end('not found')
        return
      }

      const asset = join(assetsDir, url)

      // `join` collapses `..`, so this is what stops a request escaping the
      // directory. Only reachable from a hand-typed URL, but free to rule out.
      if (!asset.startsWith(`${assetsDir}${sep}`)) {
        res.writeHead(403)
        res.end('forbidden')
        return
      }

      readFile(asset)
        .then((bytes) => {
          res.writeHead(200, { 'Content-Type': getContentType(asset) })
          res.end(bytes)
        })
        .catch(() => {
          res.writeHead(404)
          res.end('not found')
        })
      return
    }

    contentRevision()
      .then((revision) =>
        buildPage({
          config,
          cacheKey: revision,
          stylesheet,
          // Shows the sheet against a backdrop, marks where it ends, and
          // reloads on rebuild.
          head: (
            <>
              <style>{`
                /*
                 * Screen only. The backdrop and the break lines are the preview,
                 * not the document — and the padding alone would push the sheet
                 * onto a second printed page, which is what \`reportLength\`
                 * prints this very page to count.
                 */
                @media screen {
                  body { background: #525659; padding: 24px 0; }
                  .page { margin: 0 auto; box-shadow: 0 2px 12px rgb(0 0 0 / 0.5); position: relative; }
                  /*
                   * Where the printer will break. \`.page\` is one tall box that
                   * grows past the sheet — that is what puts the overflow onto a
                   * second PDF page — so without this the preview shows a long
                   * first page rather than two. Reads \`--page-height\`, the same
                   * value the \`@page\` rule takes literally, so the rule sits
                   * exactly on the break and repeats for however many pages.
                   */
                  .page::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    background: repeating-linear-gradient(
                      to bottom,
                      transparent 0,
                      transparent calc(var(--page-height) - 1px),
                      rgb(220 38 38 / 0.7) calc(var(--page-height) - 1px),
                      rgb(220 38 38 / 0.7) var(--page-height)
                    );
                  }
                }
              `}</style>
              <script>{`new EventSource('${LIVERELOAD}').onmessage = () => location.reload()`}</script>
            </>
          ),
        })
      )
      .then(({ html }) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      })
      .catch((error: unknown) => {
        // A syntax error in the document lands here, shown in the page rather
        // than taking the server down.
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end(String(error))
      })
  })

  /**
   * Runs `reportLength` after each rebuild, in one browser kept open for the
   * life of the server. A check that is already running is not joined by a
   * second: the edit that arrived queues one more run, and no more than one.
   */
  const checkLength = ((): (() => void) => {
    if (maxPages === undefined) return noop

    let browser: Promise<Browser> | undefined
    let running = false
    let queued = false

    const check = async (): Promise<void> => {
      if (running) {
        queued = true
        return
      }

      running = true

      try {
        browser ??= launchBrowser()
        await reportLength(await browser, `http://localhost:${port}/`, maxPages)
      } catch (error) {
        // No Playwright, or a document that failed to render. The preview is
        // unaffected, so only the check gives up — and only until the next save,
        // which is why a browser that failed to launch is not held on to.
        browser = undefined
        console.warn(`Length not checked: ${String(error)}`)
      } finally {
        running = false

        if (queued) {
          queued = false
          void check()
        }
      }
    }

    return () => void check()
  })()

  // Debounced: editors commonly emit several events for one save.
  const reload = debounce(() => {
    for (const client of clients) client.write('data: reload\n\n')
    checkLength()
  }, 50)

  watch(contentDir, { recursive: true }, reload)

  server.listen(port, () => {
    console.info(`Preview on http://localhost:${port}`)
    checkLength()
  })
}
