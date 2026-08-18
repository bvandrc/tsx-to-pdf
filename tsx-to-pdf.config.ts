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
  // The committed outputs/ are CI's e2e fixture — a rebuild of unchanged
  // source has to be byte-identical, which a live date would break.
  setDate: false,
} satisfies Config
