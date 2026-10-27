import { join } from 'node:path'

import { PAGE_SIZES, type ResolvedConfig } from '../config.ts'

/** The document a build is pointed at, and the directory it writes into. */
export const MOCK_FILE_NAME = 'doc'
export const ENTRY_FILE = `${MOCK_FILE_NAME}.tsx`
export const OUTPUTS_DIR = 'outputs'

/** What `loadConfig` fills in for every key a config leaves out. */
export const DEFAULTS = {
  page: PAGE_SIZES.letter,
  margin: 1,
  checkPdfFontTypes: true,
  setDate: true,
  pdf: true,
  markdown: false,
  png: false,
  jpg: false,
  port: 4000,
} satisfies Partial<ResolvedConfig>

/** A resolved config for a document at `root`, with every default in place. */
export const buildResolvedConfig = (
  root: string,
  overrides: Partial<ResolvedConfig> = {}
): ResolvedConfig => ({
  root,
  entry: ENTRY_FILE,
  entryPath: join(root, ENTRY_FILE),
  outDir: join(root, OUTPUTS_DIR),
  name: MOCK_FILE_NAME,
  ...DEFAULTS,
  ...overrides,
})
