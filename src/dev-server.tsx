import { watch } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { dirname, extname, join, sep } from 'node:path'
import { debounce } from 'es-toolkit'

import { buildPage, buildStylesheet } from './build-html.tsx'
import type { ResolvedConfig } from './config.ts'
import { createImporter } from './load-module.ts'

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

/** Shared by the rule that styles the badge and the script that adds it. */
const OVERFLOW_BADGE = 'tsx-to-pdf-overflow'

/**
 * Preview styling and script that call out a document running past `maxPages`,
 * as the height there is to trim, so an overflow shows while you are editing
 * rather than once the build has refused to generate it.
 *
 * Only ever added where the config sets `maxPages`.
 */
const overflowBadge = (maxPages: number) => (
  <>
    <style>{`
      #${OVERFLOW_BADGE} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        padding: 6px 10px;
        border-radius: 6px;
        background: rgb(220 38 38 / 0.9);
        color: #fff;
        font: 500 12px/1 ui-monospace, monospace;
        pointer-events: none;
      }
    `}</style>
    {/*
     * Measured in the page because only a browser knows the laid-out height.
     * `.page` takes the sheet as its \`min-height\`, so a sheet is taller than
     * that only when its content overflows — which is the whole measurement.
     *
     * Written without `<` or `&`: this is JSX text, so the renderer escapes
     * those into entities the browser then refuses to parse as script.
     */}
    <script>{`
      const report = () => {
        const pages = document.querySelectorAll('.page')
        if (pages.length === 0) return

        const sheet = Number.parseFloat(getComputedStyle(pages[0]).minHeight)
        const over = [...pages].reduce((total, page) => total + page.offsetHeight, 0) - sheet * ${maxPages}
        if (!(over > 0)) return

        const badge = document.body.appendChild(document.createElement('div'))
        badge.id = '${OVERFLOW_BADGE}'
        badge.textContent =
          \`\${(over * ${PT_PER_PX}).toFixed(1)}pt / \${over.toFixed(1)}px past ${maxPages === 1 ? '1 page' : `${maxPages} pages`}\`
      }

      // On \`load\` so there is a document to measure: queried from the head,
      // \`fonts.ready\` resolves before the body is even parsed. Layout is only
      // final once the fonts are, as in getBrowser.
      addEventListener('load', () => document.fonts.ready.then(report))
    `}</script>
  </>
)

/**
 * Serves the document at its exact page dimensions on a page-like backdrop, so
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
   * Newest mtime beside the document, which is what `importDocument` is keyed
   * on.
   *
   * Keying on the files rather than on a watcher event means a missed
   * filesystem notification still can't serve a stale render.
   */
  const contentRevision = async (): Promise<number> => {
    const siblings = await readdir(contentDir)
    const stats = await Promise.all(
      siblings.map((sibling) => stat(join(contentDir, sibling)))
    )

    return Math.max(...stats.map(({ mtimeMs }) => mtimeMs))
  }

  const importFresh = createImporter(config.root, {
    // So an edited component is re-read along with the entry that imports it,
    // rather than served from the module cache.
    cacheModules: false,
  })

  let loaded: { revision: number; module: Promise<unknown> } | undefined

  /** Imports the document afresh whenever a file beside it has changed. */
  const importDocument = async (path: string): Promise<unknown> => {
    const revision = await contentRevision()

    // Kept per revision rather than imported per request, so reloading an
    // unchanged document does not re-evaluate it.
    if (loaded?.revision !== revision) {
      loaded = { revision, module: importFresh(path) }
    }

    return loaded.module
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

    buildPage({
      config,
      importDocument,
      stylesheet,
      // Shows the sheet against a backdrop, marks where it ends, calls out an
      // overflow, and reloads on rebuild.
      head: (
        <>
          <style>{`
                body { background: #525659; padding: 24px 0; }
                .page { margin: 0 auto; box-shadow: 0 2px 12px rgb(0 0 0 / 0.5); position: relative; }
                /*
                 * Where the page will break. \`.page\` is one tall box that
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
              `}</style>
          <script>{`new EventSource('${LIVERELOAD}').onmessage = () => location.reload()`}</script>
          {maxPages !== undefined && overflowBadge(maxPages)}
        </>
      ),
    })
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

  // Debounced: editors commonly emit several events for one save.
  const reload = debounce(() => {
    for (const client of clients) client.write('data: reload\n\n')
  }, 50)

  watch(contentDir, { recursive: true }, reload)

  server.listen(port, () => {
    console.info(`Preview on http://localhost:${port}`)
  })
}
