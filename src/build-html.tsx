import { cp, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compile as twCompile } from '@tailwindcss/node'
import { Scanner as twScanner } from '@tailwindcss/oxide'
import { noop } from 'es-toolkit'
import type { ComponentChildren, FunctionComponent } from 'preact'
import { render as preactRenderJsxToString } from 'preact-render-to-string/jsx'
import { format as prettify } from 'prettier'

import type { ResolvedConfig } from './config.ts'

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

  await cp(assetsDir, destination, { recursive: true })
}

/** Copied beside the compiled output, so this resolves inside `dist/` too. */
const PAGE_CSS = join(import.meta.dirname, 'page.css')

/**
 * Compiles the page's stylesheet: Tailwind, then the document's own CSS, then
 * the sheet geometry with the configured page size resolved into it.
 *
 * `source(none)` turns off automatic content detection so the `@source` is the
 * only input. Without it any stray file in the project can add utilities to the
 * emitted CSS, which a staleness check would then read as a real change.
 */
export const buildStylesheet = async ({
  entry,
  styles,
  root,
  page,
}: ResolvedConfig): Promise<string> => {
  const input = [
    '@import "tailwindcss" source(none);',
    `@import "${styles}";`,
    `@source "${entry}";`,
    // Both carry the sheet: `.page` reads the variables, while `@page` needs the
    // numbers literally because Chromium rejects `var()` in `size`.
    `:root { --page-width: ${page.width}; --page-height: ${page.height}; }`,
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
export type ContentModule = {
  default: FunctionComponent
  title: string
}

/**
 * The configured document. `cacheKey` busts Node's module cache, which the dev
 * server needs so an edit reaches the page without a restart.
 *
 * A `.tsx` document needs `tsx` registered before this runs. The CLI does that;
 * callers using the API directly have to do it themselves.
 */
export const loadContent = async (
  { entryPath }: ResolvedConfig,
  cacheKey: string | number = ''
): Promise<ContentModule> =>
  (await import(
    `${pathToFileURL(entryPath).href}${cacheKey && `?v=${cacheKey}`}`
  )) as ContentModule

/**
 * Assembles the page and the stylesheet it links. They come from one call because
 * they are one render: Tailwind emits utilities by scanning the document.
 */
export const buildPage = async ({
  config,
  head,
  stylesheet,
  content: { default: Content, title },
}: {
  config: ResolvedConfig
  /** Extra `<head>` content. (The dev server passes its preview styling here.) */
  head?: ComponentChildren
  /** Where the page should link its stylesheet. */
  stylesheet: string
  /** The document to render, from `loadContent`. */
  content: ContentModule
}): Promise<{ html: string; css: string }> => {
  const css = await buildStylesheet(config)

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
