## Project

A generator: a document written as JSX, styled with Tailwind, rendered to HTML, and generated as a page-exact PDF by headless Chromium, with optional Markdown, PNG, and JPG output. The PDF and the browser preview are the same render, not two approximations of each other.

Nothing here is specific to any one document. What to render comes from the consuming project's `tsx-to-pdf.config.ts`; this repo's own config points at `example/`, so the package always has something to build and consumers have something to copy.

- **`src/`** is the package. `config.ts` owns the `Config` type, the named page sizes, and config discovery; `build-html.tsx` renders and compiles the stylesheet; `build-pdf.ts` generates the PDF and asserts; `build-markdown.ts` converts the rendered page for the optional `.md`; `build.ts` writes the outputs; `dev-server.tsx` serves the live preview; `cli.ts` is the entry point behind the `tsx-to-pdf` bin.
- **`page.css`** holds the sheet and nothing document-specific. `buildStylesheet` injects its geometry as `--page-width` / `--page-height` / `--page-margin`, beside an `@page` rule with the dimensions written literally, since Chromium rejects `var()` in `size`. That block comes *after* the document's stylesheet, so the config beats a `--page-margin` the consumer declares.
- **`example/`** is a complete document: the README's worked example, CI's end-to-end fixture, and the only proof the package works from outside, so keep it building. Its `outputs/` are committed so the result is readable without cloning; `pnpm example` regenerates them, and nothing checks they are current.

## Commands

- `pnpm build` — `tsdown` bundles `src/` into `dist/`, emits declarations, and copies `page.css` beside them. `prepare` runs it on install and publish, so it rarely needs running by hand.
- `pnpm example` / `pnpm example:html` / `pnpm dev` — drive the CLI against `example/`. The `:html` variant needs no browser.
- `pnpm check` — Biome plus `tsc --noEmit`; what CI runs. `pnpm format` fixes.
- `pnpm test` — Vitest over `src/__tests__/`. `pnpm test:watch` to re-run on a change; CI runs `pnpm test:unit`.

## Conventions

Synced from https://github.com/bvandrc/bvandrc-conventions — follow all of them:

@conventions/typescript.md — language-level TypeScript/JavaScript rules
@conventions/react.md — component and JSX rules; they apply to the Preact renderer even though nothing here runs in a browser
@conventions/ts-testing-all.md — testing rules shared by every TypeScript suite: test IDs, naming, assertions
@conventions/ts-unit-testing.md — TypeScript unit test layout, naming, fixtures, and assertions
@conventions/all.md — practice for every repo: branches, formatting, markdown, PR reviews
@conventions/npm-publishing.md — releasing, trusted publishing, `package.json` publish fields, versioning

`conventions/` is overwritten on every sync. Edit a rule upstream, never here.

## Repo conventions

- **Package manager**: pnpm. `npm install` writes a competing lockfile CI ignores.
- **The consumer's tsconfig is not trusted to set JSX.** `jsxTsconfig` writes one to `node_modules/.tsx-to-pdf/` that extends theirs (keeping their `paths` and `target`), pins `jsx`/`jsxImportSource`, and widens `include` to the whole project, because `tsx` applies one tsconfig, and only to files its `include` matches.
- **No subprocesses.** Tailwind runs through `@tailwindcss/node`'s `compile()` and `@tailwindcss/oxide`'s `Scanner`, not its CLI: Windows `.bin` shims are shell scripts, and spawning them has broken before.
- **`tsx` is a runner, not the bundler.** It is a runtime dependency only for loading the *consumer's* config and document, since Node strips types natively but cannot parse JSX. `tsdown` builds this package.
- **Preact**
  - **Only a serialiser**: `preact-render-to-string` turns static elements into HTML. No hooks, no state, no hydration. JSX escapes content, so there is no raw-HTML path.
  - **Why not React**: nothing binding. Preact ships its own types at a third of the install size, which is enough for serialising static elements.
  - **Consumers can typecheck against React**: `jsxTsconfig` pins `jsxImportSource` to Preact only when loading their document, so their own tsconfig can point it at React. They write `className` (React's types reject `class`) and import React types but no React values, which would produce elements Preact cannot render. See the README's "Using React types".
  - **Either runtime, later**: letting consumers peer install *either* runtime is a plausible future; nothing in the renderer depends on which one it is.
- **Markdown is a derivative, not a third render.**
  - **Why**: the PDF and preview are one render; the `.md` cannot be, because what this package controls (the sheet, columns, alignment, spacing) lives in classes Markdown cannot express. It is `node-html-markdown` over the rendered page, off by default, and documented as the document's text rather than the document.
  - **No `Config` key**: like `pdf`, it is a per-build choice, not a property of the document, so `build()`'s `markdown` option and the CLI's `--md` are the only ways to ask for it.
  - **A regular dependency**: imported directly, not lazily like Playwright. It is small (`node-html-parser` and an entity decoder, no DOM, unlike the ~9 MB `@mixmark-io/domino` under Turndown, used before), so an optional peer dependency bought consumers nothing.
  - **Options**: only `codeBlockStyle: 'fenced'`. Prettier rewrites bullet markers and emphasis afterwards regardless, and the library only emits ATX headings.
- **Playwright is imported lazily** inside `getBrowser` (`src/get-browser.ts`), so a build that skips `pdf`, `png`, and `jpg` works with no browser installed.
- **Point-based measurements**: sizes are in points because the output is paper, not a screen. `html { font-size: 12pt }` makes Tailwind's `0.25rem` spacing unit exactly `3pt`, so scale classes land on whole points.
- **`tsdown` builds the package**, configured in `tsdown.config.ts`.
  - **Bundled devDependencies**: `es-toolkit` and `valibot` are inlined rather than installed by every consumer: both are small, tree-shake to a few functions, and are unlikely to be in a consumer's tree already. `deps.onlyBundle` names only those two, so nothing heavier is swallowed by accident; `type-fest` stays a real dependency because bundling it inlined 33 kB of types into the declarations.
  - **Not `tsup`**: its declaration step bundles `rollup-plugin-dts` against TypeScript 5 and crashes on this repo's TypeScript 7, where `tsdown` only warns and emits correctly.
- **Typed `Object` walks**: `typedKeys`, `typedEntries`, and `typedFromEntries` (`src/utils/index.ts`) are the builtins plus the cast a call site would otherwise write by hand. Use them instead of asserting the result, and keep the builtins where the widened type is what's wanted.
