## Project

A generator: a document written as JSX, styled with Tailwind, rendered to HTML and printed to a page-exact PDF by headless Chromium. The PDF and the browser preview are the same render, not two approximations of each other.

Nothing here is specific to any one document. What to render comes from a config file in the consuming project (`tsx-to-pdf.config.ts`), and this repo's own config points at `example/` — so the package always has something to build, and consumers have something to copy.

- **`src/`** is the package. `config.ts` owns the `Config` type, the named page sizes and config discovery; `build-html.tsx` renders and compiles the stylesheet; `build-pdf.ts` prints and asserts; `build-markdown.ts` converts the rendered page for the optional `.md`; `build.ts` writes the outputs; `dev-server.tsx` serves the live preview; `cli.ts` is the entry point behind the `tsx-to-pdf` bin.
- **`page.css`** holds the sheet and nothing document-specific. Its geometry arrives as `--page-width` / `--page-height` / `--page-margin`, injected by `buildStylesheet` beside an `@page` rule carrying the dimensions literally — Chromium rejects `var()` in the `size` descriptor, so both cannot read one variable. That block is emitted *after* the document's own stylesheet, so the config wins over a `--page-margin` a consumer still declares in CSS.
- **`example/`** is a complete document — the README's worked example, and CI's end-to-end fixture. Keep it building; it is the only thing that proves the package works from the outside. Its `outputs/` are committed, so the rendered result is readable without cloning; `pnpm example` regenerates them, and nothing checks whether they are current.

## Commands

- `pnpm build` — tsdown bundles `src/` into `dist/`, emits declarations, and copies `page.css` beside them. `prepare` runs it on install and on publish, so it rarely needs invoking by hand.
- `pnpm example` / `pnpm example:html` / `pnpm dev` — drive the CLI against `example/`. The `:html` variant needs no browser.
- `pnpm check` — Biome plus `tsc --noEmit`; what CI runs. `pnpm format` fixes.

## Conventions

Synced from https://github.com/bvandrc/bvandrc-conventions — follow all of them:

@conventions/typescript.md — language-level TypeScript/JavaScript rules
@conventions/react.md — component and JSX rules; they apply to the Preact renderer even though nothing here runs in a browser
@conventions/all.md — practice for every repo: branches, formatting, markdown, PR reviews

`conventions/` is overwritten on every sync. Edit a rule upstream, never here.

## Repo conventions

- **Package manager**: pnpm. `npm install` writes a competing lockfile CI ignores.
- **The consuming project's tsconfig is not trusted to set JSX.** `jsxTsconfig` writes one into `node_modules/.tsx-to-pdf/` that extends theirs, pins `jsx`/`jsxImportSource`, and widens `include` to the whole project — `tsx` applies a single tsconfig to everything it transforms and only to files the `include` matches, so both halves are needed. Their `paths` and `target` survive because it extends rather than replaces.
- **No subprocesses.** Tailwind is driven through `@tailwindcss/node`'s `compile()` plus `@tailwindcss/oxide`'s `Scanner` rather than its CLI. Windows `.bin` shims are shell scripts, and spawning them has broken before.
- **`tsx` is a runner, not the bundler.** It is a runtime dependency used only to load the *consumer's* config and document; tsdown builds this package. Node strips type annotations natively but cannot parse JSX, which is the whole reason it is needed.
- **The renderer is Preact, but only as a serialiser** — `preact-render-to-string` turns static elements into HTML. No hooks, no state, no hydration. Its value is that JSX escapes content, so there is no raw-HTML path.
- **Not React, but not for a reason that binds.** Preact ships its own types and installs a third of the size, which is enough when the job is serialising static elements. Since `jsxImportSource` is forced at build time, none of it reaches the consumer: they can typecheck against React and still render here, as long as they write `className` and import no React values. Letting them peer install *either* runtime is a plausible future — nothing in the renderer depends on which one it is.
- **Markdown is a derivative, not a third render.** The PDF and the preview are the same render; the `.md` cannot be, because everything this package exists to control — the sheet, the columns, the alignment, the spacing — lives in classes Markdown has no way to say. It is node-html-markdown over the rendered page, off by default, and documented as the document's text rather than the document. It has no `Config` key: like `pdf`, whether to write it is a per-build choice rather than a property of the document, so `build()`'s `markdown` option and the CLI's `--md` are the only ways to ask for it. node-html-markdown is an optional peer dependency imported lazily, for the same reason Playwright is — a build that never passes `markdown` should never pay for it, install size or otherwise — though this one is small either way: no DOM implementation, just `node-html-parser` and an entity decoder underneath, unlike Turndown's `@mixmark-io/domino` (a full DOM, ~9 MB installed) that this package used before. Its only set option is `codeBlockStyle: 'fenced'` — the Prettier pass afterwards rewrites bullet markers and emphasis to its own regardless, so setting those would be describing an outcome we do not control, and the library only ever emits ATX headings.
- **Playwright is imported lazily** inside `buildPdf`, so `--no-pdf` works with no browser installed at all.
- **Point-based measurements**: sizes are in points because the output is print. `html { font-size: 12pt }` makes Tailwind's `0.25rem` spacing unit exactly `3pt`, so scale classes land on whole points.
- **The package ships compiled JS and cannot ship `.ts` source**, tempting as that is — it would delete the build step and the `dist/` question in one move. `jsxTsconfig` sets `include` but not `exclude`, so TypeScript's default `exclude` of `["node_modules", …]` applies and our own files would match no tsconfig, get no `jsxImportSource`, and compile for React. Setting `exclude: []` would fix that by applying the *consumer's* compiler options to our source — the coupling `jsxTsconfig` exists to remove — and `import { build } from 'tsx-to-pdf'` would stop working from plain Node either way.
- **tsdown builds the package**, configured in `tsdown.config.ts`. Bundling is what lets es-toolkit and valibot be devDependencies rather than something every consumer installs: both are small, both tree-shake to the handful of functions used, and neither is likely to be in a consumer's tree already, so inlining them costs less than asking for them. `deps.onlyBundle` names the two, so anything heavier cannot be swallowed by accident — type-fest is a real dependency for exactly that reason, since bundling it inlined 33 kB of helper types into the declarations. Not tsup, though it looks equivalent: its declaration step bundles `rollup-plugin-dts` against TypeScript 5 and crashes outright on this repo's TypeScript 7, where tsdown only warns and emits correctly.
