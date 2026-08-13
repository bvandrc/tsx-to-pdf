# tsx-to-pdf

Write a document as JSX, style it with Tailwind, print it to a page-exact PDF.

The preview and the PDF are the *same render* — headless Chromium prints the
HTML the dev server serves, at the same page geometry — so what you see in the
browser is what lands in the file, rather than two approximations of each other.

Built for documents that have to fit a page: a resume, a one-pager, a leave-behind.
Set `maxPages` and the build fails when the layout overflows, so "it still fits"
is enforced rather than remembered.

```sh
pnpm add -D tsx-to-pdf preact playwright
pnpm exec playwright install chromium
```

Both are peer dependencies, and for the same reason — they belong to your project,
not inside this one. Preact is the JSX runtime your document compiles against,
and your document imports its types directly (`ComponentChildren` and friends).
Playwright has to be yours for its CLI to be on *your* `node_modules/.bin`, which
is what makes that second line work.

Playwright is optional: skip it, and `build --no-pdf` still renders the HTML and
CSS.

## Getting started

Three files: a config, a document, a stylesheet.

```ts
// tsx-to-pdf.config.ts
import type { Config } from 'tsx-to-pdf'

export default {
  entry: './content/document.tsx',
  styles: './content/styles.css',
  assets: './content/assets',
  outDir: './outputs',
  name: 'resume',
} satisfies Config
```

```tsx
// content/document.tsx
export const title = 'Firstname Lastname'

const Document = () => (
  <div class="page font-serif">
    <h1 class="text-2xl">{title}</h1>
    <p class="pt-2">Anything you can write in JSX and Tailwind.</p>
  </div>
)

export default Document
```

The `.page` class is provided — it is the sheet itself, sized from your config.
Everything inside it is yours.

```css
/* content/styles.css */
:root {
  --page-margin: 0.5in;
}

@theme {
  --font-serif: "Gelasio", serif;
}
```

Then:

```sh
tsx-to-pdf dev      # live preview at the printed size
tsx-to-pdf build    # writes outputs/pdf, outputs/html
```

See [`example/`](./example) for a complete working document.

## Converting a resume you already have

You almost certainly don't want to retype an existing resume as JSX. Hand it to
an LLM — [Claude](https://claude.ai) works well for this — and have it do the
transcription.

1. **Scaffold the repo first**, so there is somewhere for the document to land.
   Copy [`example/`](./example) — a config, a `.tsx` document, a stylesheet, and
   an assets directory — and check that `tsx-to-pdf build` runs before you
   change anything. Starting from a build that works means any later breakage is
   something you just did.
2. **Give it the original, not a description of it.** Upload your existing
   resume and ask it to recreate the document as closely as it can, editing
   `content/*.tsx` and `content/styles.css` and leaving the config alone.
3. **Iterate against the preview.** Run `tsx-to-pdf dev` and put it beside
   the original. Differences in spacing and type size are the usual ones, and
   they are quick to describe: "the header block is too tight", "the dates
   should be right-aligned with the bullets".

**Export from Google Docs as HTML, not PDF.** File → Download → *Web page
(.html, zipped)*. The zip contains real markup — headings, lists, tables, and a
stylesheet with the actual fonts, sizes and margins — so the model is reading
your layout rather than guessing it from a picture. Upload the whole zip; the
images inside it are your logos and rules, and they belong in `content/assets/`.
A PDF or a screenshot works, but the model has to infer every measurement, and
it shows.

Two things worth doing yourself afterwards, since they are easy to get subtly
wrong and the build will not catch them:

- **Fonts.** Put real `.woff2` files in `content/assets/` and reference them
  from your stylesheet, rather than naming a font and hoping it resolves — see
  [Fonts are yours, from disk](#what-it-does-that-a-print-to-pdf-button-doesnt).
  Static instances, not a variable font; the build rejects the latter.
- **Read the rendered text.** Transcription errors land in dates, phone numbers
  and company names, which look plausible and are exactly the things a reader
  checks.

## One thing your project must set

**`"type": "module"` in `package.json`.** Without it your `.tsx` document is
treated as CommonJS and fails with `ERR_REQUIRE_CYCLE_MODULE`.

That is the whole list. **You do not need a `tsconfig.json` at all**, and if you
have one, nothing in it has to be right: the JSX settings are layered on top at
build time, so your `paths`, `target` and everything else still apply while
`jsxImportSource` is taken care of. You also never compile your document — it is
transformed as it loads.

A tsconfig is exported if you want your editor to match, but extending it is
optional:

```jsonc
// tsconfig.json — optional
{ "extends": "tsx-to-pdf/tsconfig" }
```

## Do you need to know Preact?

No. **You are writing JSX, which is not React-specific** — it is a syntax that
compiles to whatever `jsxImportSource` names, and React, Preact, Solid, Qwik and
Hono all consume it. If you know React, you already know how to write these
documents.

Preact is the *serializer*: it turns your elements into an HTML string at build
time. There are no hooks, no state, no hydration, and nothing ships to a browser
— which is also why the runtime is an implementation detail rather than something
you build against.

### Using React types

You can typecheck your document against React while this still renders it. The
JSX runtime is pinned at build time, so your own tsconfig can say whatever it
likes:

```jsonc
// your tsconfig.json — this is fine
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "react" } }
```

```tsx
import type { ReactNode } from 'react'

const Section = ({ children }: { children: ReactNode }) => (
  <h2 className="text-lg font-bold">{children}</h2>
)
```

Two things to know:

- **Use `className`, not `class`.** React's types reject `class`; Preact accepts
  both, so `className` is the spelling that satisfies React's typechecker and
  still emits `class="…"` in the HTML.
- **Don't import React *values*** — a component from a React package produces
  React elements, which this cannot render. Type-only imports are erased before
  runtime and are always fine. If you need a React component library, alias it
  with [`preact/compat`](https://preactjs.com/guide/v10/switching-to-preact).

## Config

| key | | |
| --- | --- | --- |
| `entry` | required | Module that default-exports the component and exports `title` |
| `styles` | required | The document's stylesheet |
| `assets` | required | Directory copied in beside the rendered page |
| `outDir` | required | Where the rendered files land |
| `name` | entry's basename | Their basename: `<name>.pdf`, `<name>.html`, `<name>.css` |
| `pageSize` | `'letter'` | `letter`, `legal`, `tabloid`, `a3`, `a4`, `a5`, or `{ width, height }` as CSS lengths |
| `maxPages` | unlimited | Building past this many pages fails. `1` for a one-pager |
| `checkPdfFontTypes` | `true` | Fail when a font embeds as Type3, which extractors read poorly |
| `producer` | `tsx-to-pdf` | `/Producer` and `/Creator` in the PDF &mdash; set it to your own name to keep the tool out of the file |
| `port` | `4000` | For `tsx-to-pdf dev` |

```
tsx-to-pdf build [--no-pdf] [--config <path>]
tsx-to-pdf dev   [--port <n>] [--config <path>]
```

`--no-pdf` writes only the HTML and CSS and never launches a browser. Those two
are a pure function of your sources, so rebuilding them is a fast, browserless
way for CI to ask whether the document actually changed.

## What it does that a print-to-PDF button doesn't

- **The output is diffable.** The rendered HTML and CSS are written alongside the
  PDF, so a change to your document shows up as a text diff rather than as a new
  binary.
- **Rebuilds are byte-identical.** Timestamps and the document ID that Chromium
  varies per run are pinned, so an unchanged document produces the same bytes —
  which is what makes a staleness check in CI meaningful.
- **The PDF is built to be read by machines.** It is emitted tagged, carrying
  headings, lists and reading order as structure rather than as text at
  coordinates. The build then asserts that the structure tree exists and that no
  font fell back to Type3 glyph procedures, both of which fail silently and both
  of which degrade text extraction. Relevant if anything downstream parses the
  result — an applicant tracking system, for instance.
- **Fonts are yours, from disk.** Put woff2 files in your assets directory and
  reference them from your stylesheet. Nothing is fetched at render time, so
  layout cannot shift because a machine resolved a font differently.

  Use **static instances, not variable fonts** — Chromium cannot embed a variable
  font in a PDF and silently falls back to Type3, which the build rejects. Generate
  them with fontTools:

  ```sh
  fonttools varLib.instancer Family[wght].ttf wght=400 \
    --output=family-regular.woff2 --flavor=woff2
  ```

## Programmatic use

The CLI is a thin wrapper around `build` and `serve`.

```ts
import { build, findConfig, loadConfig } from 'tsx-to-pdf'
import { register } from 'tsx/esm/api'

register() // needed only if your config or document is TypeScript
await build(await loadConfig(findConfig()))
```

`findConfig` looks for `tsx-to-pdf.config.{ts,mts,js,mjs}` in the cwd, or
takes an explicit path. `build` accepts `{ pdf: false }` as a second argument,
the equivalent of `--no-pdf`.

## Notes

- Chromium is installed separately (`playwright install chromium`), since the
  browser is large and yours to manage. Full Chromium, deliberately — the smaller
  `chromium-headless-shell` measures text slightly differently, and the PDF would
  stop matching the preview.
- `CHROMIUM_EXECUTABLE_PATH` overrides which browser is launched.
- JSX escapes content by construction, so there is no raw-HTML path into the
  document. See [Do you need to know Preact?](#do-you-need-to-know-preact) for
  what the renderer is and isn't.
- The written HTML is indented with Prettier rather than the renderer's own
  pretty mode, which breaks lines inside inline content — `C<em>++</em>` would
  come out as `C ++`.

## License

MIT
