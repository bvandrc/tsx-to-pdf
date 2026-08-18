import type { Config } from './src/config.ts'

export default {
  entry: './example/resume.tsx',
  styles: './example/styles.css',
  assets: './example/assets',
  outDir: './example/outputs',
  name: 'example',
  margin: 0.5,
  // A resume is a one-pager, so the build should say so when it stops being one.
  maxPages: 1,
} satisfies Config
