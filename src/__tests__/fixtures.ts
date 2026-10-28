import { join } from 'node:path'
import { omit } from 'es-toolkit'
import { getDefaults } from 'valibot'

import { CONFIG_SCHEMA, PAGE_SIZES, type ResolvedConfig } from '../config.ts'

/** The document a build is pointed at, and the directory it writes into. */
export const MOCK_FILE_NAME = 'doc'
export const ENTRY_FILE = `${MOCK_FILE_NAME}.tsx`
export const OUTPUTS_DIR = 'outputs'

const SCHEMA_DEFAULTS = getDefaults(CONFIG_SCHEMA)

/** What `loadConfig` resolves a minimal config at `root` to, every default in place. */
export const buildResolvedConfig = (
  root: string,
  overrides: Partial<ResolvedConfig> = {}
): ResolvedConfig => ({
  ...omit(SCHEMA_DEFAULTS, ['pageSize']),
  root,
  entry: ENTRY_FILE,
  entryPath: join(root, ENTRY_FILE),
  outDir: join(root, OUTPUTS_DIR),
  name: MOCK_FILE_NAME,
  page: PAGE_SIZES[SCHEMA_DEFAULTS.pageSize],
  ...overrides,
})
