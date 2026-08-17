# tsx-to-pdf

Write a document as JSX — React style, in a `.tsx` file — style it with Tailwind, and print it to a page-exact PDF, with the rendered HTML alongside it.

Features a dev server to preview the document at its printed page size, which live-updates as you make changes. It serves the same HTML the PDF is rendered from, so the preview is not an approximation of the result.

Built for documents that have to fit a page: a resume, a one-pager, a leave-behind. The sheet is yours to choose — `pageSize` takes `letter`, `legal`, `tabloid`, `a3`, `a4`, `a5`, or explicit dimensions — and setting `maxPages` fails the build when the layout overflows, so "it still fits" is enforced rather than remembered.

## Installation

```sh
npm i -D tsx-to-pdf preact playwright
npx playwright install chromium
```

### Peer dependencies

| package | required | why it is yours |
| --- | --- | --- |
| `preact` | yes | The JSX runtime your document compiles against, and where its types come from (`ComponentChildren` and friends). A lightweight alternative to React, which suits a page that is static — no hooks, no providers, nothing shipped to a browser. |
| `playwright` | no | PDF output only — omit it if you only want the HTML and CSS outputs (via `--no-pdf`). Can't be a dep of ours anyways — CLI has to be on *your* `node_modules/.bin`; it cannot run from a nested copy |
| `turndown` | no | Markdown output only (`markdown: true`) — omit it unless you want the `.md`. It parses with a full DOM implementation, 9 MB installed, which is a lot to hand everyone for an output that is off by default |

## Getting started

### Content

Two things are required: a document, and a config file. [`example/`](./example) is all of this filled in, if you would rather read a working one than a snippet.

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

```ts
// tsx-to-pdf.config.ts
import type { Config } from 'tsx-to-pdf'

export default {
  entry: './content/document.tsx',
  outDir: './outputs',
} satisfies Config
```

**Add a stylesheet when you want your own theme, and an assets directory when the page loads something at render time** — a font, a logo, etc. Neither is required: the `.page` class is the sheet itself, sized from your config, and Tailwind's utilities are compiled from whatever your JSX uses (for example, `font-serif` above resolves to Tailwind's own stack until you theme it).

```ts
// tsx-to-pdf.config.ts — with both
export default {
  entry: './content/document.tsx',
  outDir: './outputs',
  styles: './content/styles.css',
  assets: './content/assets',
  name: 'resume',
} satisfies Config
```

```css
/* content/styles.css */
@theme {
  --font-serif: "Gelasio", serif;
}
```

### Project config

**`"type": "module"` in `package.json`.** Without it your `.tsx` document is treated as CommonJS and fails with `ERR_REQUIRE_CYCLE_MODULE`.

That's it. **You do not need a `tsconfig.json` at all**, and if you have one, nothing in it has to be right: the JSX settings are layered on top at build time, so your `paths`, `target` and everything else still apply while `jsxImportSource` is taken care of. You also never compile your document — it is transformed as it loads.

A tsconfig is exported if you want your editor to match, but extending it is optional:

```jsonc
// tsconfig.json — optional
{ "extends": "tsx-to-pdf/tsconfig" }
```

### Executing

```sh
tsx-to-pdf dev      # live preview at the printed size
tsx-to-pdf build    # writes outputs/pdf, outputs/html (and outputs/md, with `markdown`)
```

## Config

| key | default | what it does |
| --- | --- | --- |
| `entry` | required | `.tsx` module that default-exports the component and exports `title` |
| `outDir` | required | Where the rendered files land |
| `styles` | — | The document's stylesheet. Tailwind and the sheet are there without one |
| `assets` | — | Directory copied in beside the rendered page |
| `name` | `entry`'s basename | Their basename: `<name>.pdf`, `<name>.html`, `<name>.css` |
| `markdown` | `false` | Also write `<name>.md`: the document's text, without any of its layout. See [Markdown output](#markdown-output) |
| `pageSize` | `'letter'` | `letter`, `legal`, `tabloid`, `a3`, `a4`, `a5`, or `{ width, height }` as CSS lengths |
| `margin` | `1` | White space around the document, **in inches**: one number, or `{ top, right, bottom, left }` with every side given |
| `maxPages` | unlimited | Building past this many pages fails. Set to `1` for a one-pager |
| `checkPdfFontTypes` | `true` | Fail when a font embeds as Type3, which extractors read poorly |
| `author` | — | `/Author` in the PDF: the person who wrote the document. This is where your own name goes |
| `port` | `4000` | For `tsx-to-pdf dev` |

```
tsx-to-pdf build [--no-pdf] [--config <path>]
tsx-to-pdf dev   [--port <n>] [--config <path>]
```

`--no-pdf` never launches a browser: it writes the HTML and CSS, and the Markdown if you asked for it. Those are a pure function of your sources, so rebuilding them is a fast, browserless way for CI to ask whether the document actually changed.

## Markdown output

`markdown: true` writes `<name>.md` beside the rest, converted from the same HTML the PDF is printed from. It needs Turndown, which is yours to install (`npm i -D turndown`) — the build says so if it is missing. **It is the document's text, not the document.** Headings, lists, links and emphasis survive because they are elements; everything this package exists to control does not, because it lives in classes Markdown cannot express — the sheet, the margins, columns, alignment, spacing, colour. A row that puts a job title on the left and its dates on the right comes out as two stacked blocks.

That makes it useful for the things that read text and ignore layout — a diff that shows what changed in the wording, an ATS or an LLM being handed a resume, a `grep` — and not for anything that has to look right. The PDF and the preview are the same render; the Markdown is a derivative of it.

## Do you need to know React or Preact?

No. **You are writing JSX — `.tsx` files — which is not React-specific.** It is a syntax, consumed by React, Preact, Solid, Qwik and other JSX runtimes alike; which one compiles it is decided by `jsxImportSource`, and here that is settled for you. If you know React, you know how to write these documents.

Preact is the *serializer*: it turns your elements into an HTML string at build time. There are no hooks, no state, no hydration, and nothing ships to a browser — which is also why the runtime is an implementation detail rather than something you build against.

## Using React types

You can typecheck your document against React while this still renders it. The JSX runtime is pinned at build time, so your own tsconfig can say whatever it likes:

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

- **Use `className`, not `class`.** React's types reject `class`; Preact accepts both, so `className` is the spelling that satisfies React's typechecker and still emits `class="…"` in the HTML.
- **Don't import React *values*** — a component from a React package produces React elements, which this cannot render. Type-only imports are erased before runtime and are always fine. If you need a React component library, alias it with [`preact/compat`](https://preactjs.com/guide/v10/switching-to-preact).

## Converting a document you already have

You almost certainly don't want to retype an existing document as JSX. Hand it to an LLM — [Claude](https://claude.ai) works well for this — and have it do the transcription.

1. **Scaffold the repo first**, so there is somewhere for the document to land. Copy [`example/`](./example) — a config, a `.tsx` document, a stylesheet, and an assets directory — and check that `tsx-to-pdf build` runs before you change anything. Starting from a build that works means any later breakage is something you just did.
2. **Export your existing doc as HTML, if you can.** Google Docs does this under File → Download → *Web page (.html, zipped)*, and it is a much better input than a PDF: the markup carries the headings, fonts, sizes and margins, so the model reads your layout rather than inferring it. Upload the whole zip. A PDF or a screenshot works, but every measurement is then a guess and the conversion is less accurate.
3. **Upload your existing document** (the zipped HTML, PDF, image, etc.) and **ask it to recreate it** as accurately as possible, editing `content/*.tsx` and `content/styles.css` and leaving the config alone.
4. **Iterate against the preview.** Run `tsx-to-pdf dev` and put it beside the original. Differences in spacing and type size are the usual ones, and they are quick to describe: "the header block is too tight", "the dates should be right-aligned with the bullets".

Two things worth doing yourself afterwards, since they are easy to get subtly wrong and the build will not catch them:

- **Fonts.** Put real `.woff2` files in `content/assets/` and reference them from your stylesheet, rather than naming a font and hoping it resolves. Use **static instances, not variable fonts** — Chromium cannot embed a variable font in a PDF and silently falls back to Type3, which the build rejects. Generate them with fontTools:

  ```sh
  fonttools varLib.instancer Family[wght].ttf wght=400 \
    --output=family-regular.woff2 --flavor=woff2
  ```

- **Read the rendered text.** Transcription errors land in dates, phone numbers and company names, which look plausible and are exactly the things a reader checks.

## Programmatic use

The CLI is a thin wrapper around `build` and `serve`.

```ts
import { build, findConfig, loadConfig } from 'tsx-to-pdf'
import { register } from 'tsx/esm/api'

register() // needed only if your config or document is TypeScript
await build(await loadConfig(findConfig()))
```

`findConfig` looks for `tsx-to-pdf.config.{ts,mts,js,mjs}` in the cwd, or takes an explicit path. `build` accepts `{ pdf: false }` as a second argument, the equivalent of `--no-pdf`.

## Notes

- Chromium is installed separately (`playwright install chromium`), since the browser is large and yours to manage. The full browser is pinned rather than the `chromium-headless-shell` a headless launch would otherwise pick: the shell lays text out about 1.7% taller, which is enough to push a full page onto a second one on one machine and not the next. Don't install with `--only-shell`.
- `CHROMIUM_EXECUTABLE_PATH` overrides which browser is launched.
- JSX escapes content by construction, so there is no raw-HTML path into the document. See [Do you need to know React or Preact?](#do-you-need-to-know-react-or-preact) for what the renderer is and isn't.

## License

MIT
