import { defineConfig } from './src/config.ts'

export default defineConfig({
  entry: './example/resume.tsx',
  styles: './example/styles.css',
  assets: './example/assets',
  outDir: './example/outputs',
  name: 'example',
  // A resume is a one-pager, so the build should say so when it stops being one.
  maxPages: 1,
})
