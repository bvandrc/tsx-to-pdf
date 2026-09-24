import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { buildStylesheet, copyAssets } from '../build-html.tsx'
import type { ResolvedConfig } from '../config.ts'
import { PAGE_SIZES } from '../config.ts'

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
  entry: 'doc.tsx',
  entryPath: join(root, 'doc.tsx'),
  outDir: join(root, 'outputs'),
  name: 'doc',
  page: PAGE_SIZES.letter,
  port: 4000,
  setDate: true,
  ...overrides,
})

describe('copyAssets', () => {
  it("puts the assets beside the page, keeping what it's told to keep", async () => {
    const root = await makeDirTree({
      'assets/logo.svg': '<svg />',
      'outputs/html/doc.html': '<html></html>',
      'outputs/html/doc.css': '',
    })
    const destination = join(root, 'outputs/html')

    await copyAssets(
      resolvedConfig(root, { assetsDir: join(root, 'assets') }),
      destination,
      ['doc.html', 'doc.css']
    )

    expect((await readdir(destination)).sort()).toEqual([
      'doc.css',
      'doc.html',
      'logo.svg',
    ])
  })

  it('clears an asset that the config no longer copies', async () => {
    const root = await makeDirTree({
      'outputs/html/doc.html': '<html></html>',
      'outputs/html/removed.svg': '<svg />',
    })
    const destination = join(root, 'outputs/html')

    // No `assetsDir` at all: the clear still runs, which is what stops a
    // dropped `assets` leaving its files in the output forever.
    await copyAssets(resolvedConfig(root), destination, ['doc.html'])

    expect(await readdir(destination)).toEqual(['doc.html'])
  })

  it('clears a directory of stale assets, not just loose files', async () => {
    const root = await makeDirTree({
      'outputs/html/doc.html': '<html></html>',
      'outputs/html/fonts/old.woff2': '',
    })
    const destination = join(root, 'outputs/html')

    await copyAssets(resolvedConfig(root), destination, ['doc.html'])

    expect(await readdir(destination)).toEqual(['doc.html'])
  })
})

describe('buildStylesheet', () => {
  /** A document whose classes are what Tailwind has to be given to emit. */
  const withDocument = (contents = '<div className="flex" />') =>
    makeDirTree({ 'doc.tsx': `export default () => ${contents}` })

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

  it('emits the utilities the document actually uses, and no others', async () => {
    const root = await withDocument('<div className="flex" />')

    const css = await buildStylesheet(resolvedConfig(root))

    expect(css).toContain('.flex')
    expect(css).not.toContain('.grid')
  })

  it('scans a component beside the entry, not just the entry itself', async () => {
    const root = await makeDirTree({
      'doc.tsx': 'export default () => null',
      'parts/Header.tsx':
        'export const Header = () => <h1 className="italic" />',
    })

    expect(await buildStylesheet(resolvedConfig(root))).toContain('.italic')
  })
})
