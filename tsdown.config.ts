import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // `page.css` is read at runtime relative to the compiled file, so it has to
  // land beside it.
  copy: [{ from: 'src/page.css', to: 'dist' }],
  // es-toolkit is a devDependency, tree-shaken in rather than installed by
  // every consumer. Naming it explicitly means a new runtime dependency can
  // never be bundled in by accident — it would have to be added here first.
  deps: {
    onlyBundle: ['es-toolkit'],
  },
})
