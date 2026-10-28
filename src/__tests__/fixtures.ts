import { join } from 'node:path'
import { isUndefined, omitBy } from 'es-toolkit'
import type { ConditionalExcept } from 'type-fest'
import { getDefaults } from 'valibot'

import { CONFIG_SCHEMA, PAGE_SIZES, type ResolvedConfig } from '../config.ts'

/** The document a build is pointed at, and the directory it writes into. */
export const MOCK_FILE_NAME = 'doc'
export const ENTRY_FILE = `${MOCK_FILE_NAME}.tsx`
export const OUTPUTS_DIR = 'outputs'

const SCHEMA_DEFAULTS = getDefaults(CONFIG_SCHEMA)

// `getDefaults` lists every key, `undefined` where the schema has no default.
// Its type already says which, and `omitBy` would widen it to `Partial`.
const { pageSize, ...DEFAULTED } = omitBy(
  SCHEMA_DEFAULTS,
  isUndefined
) as ConditionalExcept<typeof SCHEMA_DEFAULTS, undefined>

/** What `loadConfig` fills in for every key a config leaves out. */
export const DEFAULTS = {
  ...DEFAULTED,
  page: PAGE_SIZES[pageSize],
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
