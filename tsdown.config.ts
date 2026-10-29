import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // `page.css` is read at runtime relative to the compiled file, so it has to
  // land beside it.
  copy: [{ from: 'src/page.css', to: 'dist' }],
  deps: {
    // Naming each bundled package means something heavier cannot be swallowed
    // by accident: it has to be added here first.
    onlyBundle: [
      // Only a few small functions are used, which is all tree-shaking keeps,
      // so it is a devDependency bundled in rather than installed by everyone.
      'es-toolkit',
    ],
  },
})
