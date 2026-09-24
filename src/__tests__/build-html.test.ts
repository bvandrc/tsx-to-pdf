import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { buildStylesheet, copyAssets } from '../build-html.tsx'
import type { ResolvedConfig } from '../config.ts'
import { PAGE_SIZES } from '../config.ts'

/** The document a build is pointed at, and the two files it writes from it. */
const NAME = 'doc'
const ENTRY = `${NAME}.tsx`
const PAGE = `${NAME}.html`
const SHEET = `${NAME}.css`

const LOGO = 'logo.svg'
const ASSETS_DIR = 'assets'
const OUT_DIR = 'outputs'
const HTML_DIR = join(OUT_DIR, 'html')

/** Contents nothing under test reads — only whether the file is there. */
const SVG = '<svg />'
const MARKUP = '<html></html>'

const roots: string[] = []

afterAll(async () => {
  await Promise.all(
    roots.map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

/**
 * A real directory tree, since these functions are the ones that touch disk.
 *
 * Keys are paths relative to the directory; a key ending in `/` is an empty
 * folder. Built inside this package's `node_modules` rather than the system
 * temp dir, because Tailwind resolves `@import "tailwindcss"` from the root it
 * is given and only a directory under one can reach it.
 */
const makeDirTree = async (files: Record<string, string>) => {
  const dir = await mkdtemp(
    join(import.meta.dirname, '../../node_modules/.tsx-to-pdf-test-')
  )
  roots.push(dir)

  for (const [path, contents] of Object.entries(files)) {
    const full = join(dir, path)
    if (path.endsWith('/')) {
      await mkdir(full, { recursive: true })
      continue
    }
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, contents)
  }

  return dir
}

const resolvedConfig = (
  root: string,
  overrides: Partial<ResolvedConfig> = {}
): ResolvedConfig => ({
  root,
  entry: ENTRY,
  entryPath: join(root, ENTRY),
  outDir: join(root, OUT_DIR),
  name: NAME,
  page: PAGE_SIZES.letter,
  port: 4000,
  setDate: true,
  ...overrides,
})

describe('copyAssets', () => {
  /** A build that has written its page, which is the state a copy runs after. */
  const built = async (files: Record<string, string> = {}) => {
    const root = await makeDirTree({
      [join(HTML_DIR, PAGE)]: MARKUP,
      ...files,
    })

    return { root, destination: join(root, HTML_DIR) }
  }

  it("puts the assets beside the page, keeping what it's told to keep", async () => {
    const { root, destination } = await built({
      [join(ASSETS_DIR, LOGO)]: SVG,
      [join(HTML_DIR, SHEET)]: '',
    })

    await copyAssets(
      resolvedConfig(root, { assetsDir: join(root, ASSETS_DIR) }),
      destination,
      [PAGE, SHEET]
    )

    expect((await readdir(destination)).sort()).toEqual([SHEET, PAGE, LOGO])
  })

  it('clears an asset that the config no longer copies', async () => {
    const { root, destination } = await built({
      [join(HTML_DIR, 'removed.svg')]: SVG,
    })

    // No `assetsDir` at all: the clear still runs, which is what stops a
    // dropped `assets` leaving its files in the output forever.
    await copyAssets(resolvedConfig(root), destination, [PAGE])

    expect(await readdir(destination)).toEqual([PAGE])
  })

  it('clears a directory of stale assets, not just loose files', async () => {
    const { root, destination } = await built({
      [join(HTML_DIR, 'fonts/old.woff2')]: '',
    })

    await copyAssets(resolvedConfig(root), destination, [PAGE])

    expect(await readdir(destination)).toEqual([PAGE])
  })
})

describe('buildStylesheet', () => {
  /** A document whose classes are what Tailwind has to be given to emit. */
  const withDocument = (contents = '<div className="flex" />') =>
    makeDirTree({ [ENTRY]: `export default () => ${contents}` })

  it('carries the sheet as variables and in the `@page` rule alike', async () => {
    const root = await withDocument()

    const css = await buildStylesheet(
      resolvedConfig(root, { page: PAGE_SIZES.a4 })
    )

    expect(css).toContain('--page-width: 210mm')
    expect(css).toContain('--page-height: 297mm')
    // Chromium rejects `var()` in `size`, so the numbers appear twice on purpose.
    expect(css).toContain('@page {\n  size: 210mm 297mm;')
  })

  it('defaults the margin to the inch a word processor would give', async () => {
    const root = await withDocument()

    expect(await buildStylesheet(resolvedConfig(root))).toContain(
      '--page-margin: 1in'
    )
  })

  it('emits one number as all four sides', async () => {
    const root = await withDocument()

    expect(
      await buildStylesheet(resolvedConfig(root, { margin: 0.5 }))
    ).toContain('--page-margin: 0.5in')
  })

  it('emits the four sides in CSS padding order', async () => {
    const root = await withDocument()

    const css = await buildStylesheet(
      resolvedConfig(root, {
        margin: { top: 1, right: 2, bottom: 3, left: 4 },
      })
    )

    expect(css).toContain('--page-margin: 1in 2in 3in 4in')
  })

  it('scans a component beside the entry, not just the entry itself', async () => {
    const root = await makeDirTree({
      [ENTRY]: 'export default () => null',
      'parts/Header.tsx':
        'export const Header = () => <h1 className="italic" />',
    })

    expect(await buildStylesheet(resolvedConfig(root))).toContain('.italic')
  })
})
