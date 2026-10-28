import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // `page.css` is read at runtime relative to the compiled file, so it has to
  // land beside it.
  copy: [{ from: 'src/page.css', to: 'dist' }],
  // Only a few small functions are used, which is all tree-shaking keeps: kept
  // as a devDependency and bundled in rather than installed by everyone. Naming
  // it explicitly means something heavier cannot be swallowed by accident — it
  // has to be added here first.
  deps: {
    onlyBundle: ['es-toolkit'],
  },
})
