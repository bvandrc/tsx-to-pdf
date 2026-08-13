import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // `page.css` is read at runtime relative to the compiled file, so it has to
  // land beside it.
  copy: [{ from: 'src/page.css', to: 'dist' }],
  // Small libraries a consumer is unlikely to already have, that tree-shake to
  // very little of themselves: kept as devDependencies and bundled in rather
  // than installed by everyone. (type-fest weighs nothing either way — it is
  // types only, and inlining them means a consumer needs no `types` dependency
  // to read ours.) Naming them explicitly means something heavier cannot be
  // swallowed by accident — it has to be added here first.
  deps: {
    onlyBundle: ['es-toolkit', 'type-fest', 'valibot'],
  },
})
