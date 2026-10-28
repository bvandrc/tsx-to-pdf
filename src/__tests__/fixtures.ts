import { join } from 'node:path'
import { omit } from 'es-toolkit'

import { CONFIG_DEFAULTS, PAGE_SIZES, type ResolvedConfig } from '../config.ts'

/** The document a build is pointed at, and the directory it writes into. */
export const MOCK_FILE_NAME = 'doc'
export const ENTRY_FILE = `${MOCK_FILE_NAME}.tsx`
export const OUTPUTS_DIR = 'outputs'

/** What `loadConfig` resolves a minimal config at `root` to, every default in place. */
export const buildResolvedConfig = (
  root: string,
  overrides: Partial<ResolvedConfig> = {}
): ResolvedConfig => ({
  root,
  entry: ENTRY_FILE,
  entryPath: join(root, ENTRY_FILE),
  outDir: join(root, OUTPUTS_DIR),
  name: MOCK_FILE_NAME,
  ...omit(CONFIG_DEFAULTS, ['pageSize']),
  page: PAGE_SIZES[CONFIG_DEFAULTS.pageSize],
  ...overrides,
})
