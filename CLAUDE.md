## Project

A generator: a document written as JSX, styled with Tailwind, rendered to HTML and
printed to a page-exact PDF by headless Chromium. The PDF and the browser preview
are the same render, not two approximations of each other.

Nothing here is specific to any one document. What to render comes from a config
file in the consuming project (`tsx-to-pdf.config.ts`), and this repo's own
config points at `example/` so the package always has something to build.

- **`src/`** is the package. `config.ts` owns the `Config` type, the named page
  sizes and config discovery; `build-html.tsx` renders and compiles the
  stylesheet; `build-pdf.ts` prints and asserts; `build.ts` writes the outputs;
  `dev-server.tsx` serves the live preview; `cli.ts` is the entry point behind
  the `tsx-to-pdf` bin.
- **`example/`** is a complete document — the README's worked example, and CI's
  end-to-end fixture. Keep it building; it is the only thing that proves the
  package works from the outside. Its `outputs/` are committed, so the rendered
  result is readable without cloning; `pnpm example` regenerates them, and
  nothing checks whether they are current.
- **`page.css`** holds the sheet and nothing document-specific. Its dimensions
  arrive as `--page-width` / `--page-height`, injected by `buildStylesheet`
  beside an `@page` rule carrying the same numbers literally — Chromium rejects
  `var()` in the `size` descriptor, so both cannot read one variable.

## Commands

- `pnpm build` — tsdown bundles `src/` into `dist/`, emits declarations, and
  copies `page.css` beside them. `prepare` runs it on install and on publish, so
  it rarely needs invoking by hand.
- `pnpm example` / `pnpm example:html` / `pnpm dev` — drive the CLI against
  `example/`. The `:html` variant needs no browser.
- `pnpm check` — Biome plus `tsc --noEmit`; what CI runs. `pnpm format` fixes.

## Conventions

Synced from https://github.com/bvandrc/bvandrc-conventions — follow all of them:

@conventions/typescript.md — language-level TypeScript/JavaScript rules
@conventions/react.md — component and JSX rules; they apply to the Preact
renderer even though nothing here runs in a browser
@conventions/git.md — branch naming, formatting, and PR review practice

`conventions/` is overwritten on every sync. Edit a rule upstream, never here.

## Repo conventions

- **`dist/` is gitignored, and `prepare` builds it.** npm ships the built output
  through `files`, so a consumer never runs the build; `prepare` covers publish
  and local installs alike. It was committed for exactly as long as
  `bvandrc-resumes` installed this from git — pnpm refuses a git dependency's
  build scripts unless the consumer allowlists it by a URL carrying the commit,
  which would have meant editing that entry on every release here.
- **The consuming project's tsconfig is not trusted to set JSX.** `jsxTsconfig`
  writes one into `node_modules/.tsx-to-pdf/` that extends theirs, pins
  `jsx`/`jsxImportSource`, and widens `include` to the whole project — `tsx`
  applies a single tsconfig to everything it transforms and only to files the
  `include` matches, so both halves are needed. Their `paths` and `target`
  survive because it extends rather than replaces.
- **tsdown builds the package**, configured in `tsdown.config.ts`. Bundling is
  what lets es-toolkit be a devDependency — `deps.onlyBundle` names it as the one
  thing tree-shaken in, so a new runtime dependency cannot be swallowed by
  accident.
- **Not tsup**, though it looks equivalent: its declaration step bundles
  `rollup-plugin-dts` against TypeScript 5 and crashes outright on this repo's
  TypeScript 7. tsdown only warns and emits correctly.
- **No subprocesses.** Tailwind is driven through `@tailwindcss/node`'s
  `compile()` plus `@tailwindcss/oxide`'s `Scanner` rather than its CLI. Windows
  `.bin` shims are shell scripts, and spawning them has broken before.
- **`tsx` is a runner, not the bundler.** It is a runtime dependency used only to
  load the *consumer's* config and document; tsdown builds this package. Node
  strips type annotations natively but cannot parse JSX, which is the whole
  reason it is needed.
- **The package ships compiled JS and cannot ship `.ts` source**, tempting as
  that is — it would delete
  the build step and the `dist/` question in one move. `jsxTsconfig` sets
  `include` but not `exclude`, so TypeScript's default `exclude` of
  `["node_modules", …]` applies and our own files would match no tsconfig, get no
  `jsxImportSource`, and compile for React. Setting `exclude: []` would fix that
  by applying the *consumer's* compiler options to our source — the coupling
  `jsxTsconfig` exists to remove — and `import { build } from 'tsx-to-pdf'`
  would stop working from plain Node either way.
- **The renderer is Preact, but only as a serialiser** — `preact-render-to-string`
  turns static elements into HTML. No hooks, no state, no hydration. Its value is
  that JSX escapes content, so there is no raw-HTML path.
- **Not React, and the reason is the output.** React's `renderToStaticMarkup`
  takes only `{ identifierPrefix }` — it cannot indent, so the committed HTML
  would be one unbroken line. Preact also ships its own types and installs a
  third of the size. Since `jsxImportSource` is forced at build time, none of
  this reaches the consumer: they can typecheck against React and still render
  here, as long as they write `className` and import no React values.
- **Prettier formats the emitted HTML**, not the renderer's `pretty` mode, which
  breaks lines inside inline content and turns `C<em>++</em>` into `C ++`. That
  corrupts the PDF too, since it is printed from the written HTML. htmlfy has the
  same defect; js-beautify is correct but pulls five transitive dependencies.
- **Playwright is imported lazily** inside `buildPdf`, so `--no-pdf` works with
  no browser installed at all.
- **Point-based measurements**: sizes are in points because the output is print.
  `html { font-size: 12pt }` makes Tailwind's `0.25rem` spacing unit exactly
  `3pt`, so scale classes land on whole points.
- **Package manager**: pnpm. `npm install` writes a competing lockfile CI ignores.
