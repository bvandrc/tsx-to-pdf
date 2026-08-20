import { existsSync, readFileSync } from 'node:fs'
import { cp, readdir, readFile, rm } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compile as twCompile } from '@tailwindcss/node'
import { Scanner as twScanner } from '@tailwindcss/oxide'
import { noop } from 'es-toolkit'
import type { ComponentChildren, FunctionComponent } from 'preact'
import { render as preactRenderJsxToString } from 'preact-render-to-string/jsx'
import { format as prettify } from 'prettier'

import type { Margin, ResolvedConfig } from './config.ts'

/** Puts the assets beside a rendered page, leaving only them and `keep`. */
export const copyAssets = async (
  { assetsDir }: ResolvedConfig,
  destination: string,
  keep: string[]
): Promise<void> => {
  // Cleared first because `cp` only adds: a deleted asset would otherwise sit in
  // the written output forever.
  for (const name of await readdir(destination)) {
    if (!keep.includes(name)) {
      await rm(join(destination, name), { recursive: true, force: true })
    }
  }

  // Still cleared above when there is nothing to copy, so dropping `assets`
  // from the config clears what it left behind.
  if (assetsDir) {
    await cp(assetsDir, destination, { recursive: true })
  }
}

/** Copied beside the compiled output, so this resolves inside `dist/` too. */
const PAGE_CSS = join(import.meta.dirname, 'page.css')

/** What Word, Google Docs and Pages all give a document. */
const DEFAULT_MARGIN = 1

/** CSS padding order, which is also the order the sides are emitted in. */
const MARGIN_SIDES = ['top', 'right', 'bottom', 'left'] as const

/** A document's own files — what a relative import might resolve to. */
const IMPORTABLE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js']

/**
 * Every specifier a `from` clause names, plus bare `import '...'` and dynamic
 * `import('...')` calls. Good enough to find local files to scan — it does not
 * need to understand the syntax, just find the string literals that name a module.
 */
const IMPORT_SPECIFIER =
  /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm

const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(IMPORT_SPECIFIER)].map(
    (match) => match[1] ?? match[2] ?? match[3]
  )

/** A relative specifier resolved to a file on disk, trying extensions and index files. */
const resolveRelativeImport = (
  specifier: string,
  fromDir: string
): string | undefined => {
  const target = join(fromDir, specifier)

  const candidates = extname(target)
    ? [target]
    : [
        ...IMPORTABLE_EXTENSIONS.map((extension) => `${target}${extension}`),
        ...IMPORTABLE_EXTENSIONS.map((extension) =>
          join(target, `index${extension}`)
        ),
      ]

  return candidates.find((candidate) => existsSync(candidate))
}

/**
 * The entry and every local file it imports, transitively — so a document split
 * across files is scanned for Tailwind classes the same as one that isn't.
 * Imports from packages are skipped: only a document's own files hold its classes.
 */
const localSources = (
  entryPath: string,
  seen = new Set<string>()
): Set<string> => {
  if (seen.has(entryPath)) return seen
  seen.add(entryPath)

  const fromDir = dirname(entryPath)

  for (const specifier of importSpecifiers(readFileSync(entryPath, 'utf8'))) {
    if (!specifier.startsWith('.')) continue

    const resolved = resolveRelativeImport(specifier, fromDir)

    if (resolved && IMPORTABLE_EXTENSIONS.includes(extname(resolved))) {
      localSources(resolved, seen)
    }
  }

  return seen
}

/** A number or the four sides alike become the padding the sheet is given. */
const toMargin = (margin: Margin = DEFAULT_MARGIN): string =>
  typeof margin === 'number'
    ? `${margin}in`
    : MARGIN_SIDES.map((side) => `${margin[side]}in`).join(' ')

/**
 * Compiles the page's stylesheet: Tailwind, then the document's own CSS, then
 * the sheet geometry with the configured page size resolved into it.
 */
export const buildStylesheet = async ({
  entryPath,
  styles,
  root,
  page,
  margin,
}: ResolvedConfig): Promise<string> => {
  const input = [
    // `source(none)` turns off automatic content detection so the `@source`
    // lines below are the only input. Without it any stray file in the project
    // can add utilities to the emitted CSS, which a staleness check reads as a
    // change.
    '@import "tailwindcss" source(none);',
    // A document that only uses utility classes needs no stylesheet of its own.
    ...(styles ? [`@import "${styles}";`] : []),
    // The entry alone would miss classes that live in a file it imports — a
    // component split out of the document, say — so its import graph is walked
    // too.
    ...[...localSources(entryPath)].map((source) => `@source "${source}";`),
    // Both carry the sheet: `.page` reads the variables, while `@page` needs the
    // numbers literally because Chromium rejects `var()` in `size`. Emitted
    // after the document's import, so the config wins over a stray `:root`.
    `:root { --page-width: ${page.width}; --page-height: ${page.height}; --page-margin: ${toMargin(margin)}; }`,
    `@page { size: ${page.width} ${page.height}; margin: 0; }`,
    await readFile(PAGE_CSS, 'utf8'),
  ].join('\n')

  const compiler = await twCompile(input, {
    base: root,
    // Only drives watch mode, which the dev server handles for itself.
    onDependency: noop,
  })

  // Tailwind emits a utility only where something uses it, so the document has
  // to be scanned first. `sources` is what the `@source` rule resolved to.
  const scanner = new twScanner({ sources: compiler.sources })

  return compiler.build(scanner.scan())
}

/** What a document module has to provide to be rendered. */
type ContentModule = {
  default: FunctionComponent
  title: string
}

/**
 * Assembles the page and the stylesheet it links. They come from one call because
 * they are one render: Tailwind emits utilities by scanning the document.
 */
export const buildPage = async ({
  config,
  head,
  stylesheet,
  cacheKey,
}: {
  config: ResolvedConfig
  /** Extra `<head>` content. (The dev server passes its preview styling here.) */
  head?: ComponentChildren
  /** Where the page should link its stylesheet. */
  stylesheet: string
  /** Busts the module cache, so the dev server sees an edited document. */
  cacheKey?: string | number
}): Promise<{ html: string; css: string }> => {
  const css = await buildStylesheet(config)

  // A `.tsx` document needs `tsx` registered before this import. The CLI does
  // that; callers using the API directly have to do it themselves.
  const content = (await import(
    `${pathToFileURL(config.entryPath).href}${cacheKey ? `?v=${cacheKey}` : ''}`
  )) as Partial<ContentModule>

  if (
    typeof content.default !== 'function' ||
    typeof content.title !== 'string'
  ) {
    throw new Error(
      `${config.entry} must default-export a component and export a \`title\` string.`
    )
  }

  const { default: Content, title } = content

  const page = (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>{title}</title>
        <link rel="stylesheet" href={stylesheet} />
        {head}
      </head>
      <body>
        <Content />
      </body>
    </html>
  )

  let markup: string

  try {
    markup = preactRenderJsxToString(
      page,
      {},
      {
        // Prettier indents instead, because this one breaks lines inside inline
        // content: https://github.com/preactjs/preact-render-to-string/issues/273
        pretty: false,
        jsx: false,
      }
    )
  } catch (error) {
    // The one failure a correct document still hits: JSX compiled for React,
    // because the project's tsconfig did not reach it.
    if (
      error instanceof ReferenceError &&
      error.message.includes('React is not defined')
    ) {
      throw new Error(
        'The document was compiled for React. Its JSX needs `"jsx": ' +
          '"react-jsx"` and `"jsxImportSource": "preact"`, from a tsconfig ' +
          'whose `include` covers the document — extend "tsx-to-pdf/tsconfig".',
        { cause: error }
      )
    }

    throw error
  }

  // doctype must be prepended rather than rendered — it is not an element.
  const html = await prettify(`<!doctype html>${markup}`, {
    parser: 'html',
    printWidth: 100,
  })

  return { html, css }
}
