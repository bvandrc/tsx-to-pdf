import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { omit } from 'es-toolkit'
import { vol } from 'memfs'
import { getDefaults } from 'valibot'

import {
  CONFIG_SCHEMA,
  type Config,
  findConfig,
  loadConfig,
  PAGE_SIZES,
  resolveConfig,
} from '../config.ts'

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs')
  return { ...fs, default: fs }
})

describe('findConfig', () => {
  beforeEach(() => {
    vol.reset()
  })

  it('accepts the other extensions a config may use', () => {
    for (const extension of ['mts', 'js', 'mjs']) {
      vol.reset()
      vol.fromJSON({ [`/project/tsx-to-pdf.config.${extension}`]: '' })

      expect(findConfig(undefined, '/project'), extension).toBe(
        join('/project', `tsx-to-pdf.config.${extension}`)
      )
    }
  })

  it('says what to create when a project has no config at all', () => {
    expect(() => findConfig(undefined, '/project')).toThrow('No config found')
  })
})

describe('resolveConfig', () => {
  /** A minimal valid config, as written in code or default-exported from a file. */
  const MINIMAL = { entry: 'doc.tsx', outDir: 'outputs' } satisfies Config
  const ROOT = '/project'

  it('resolves the paths against the root it is given', () => {
    expect(
      resolveConfig({ ...MINIMAL, assets: '../shared/assets' }, ROOT)
    ).toMatchObject({
      root: ROOT,
      entryPath: join(ROOT, 'doc.tsx'),
      outDir: join(ROOT, 'outputs'),
      assetsDir: join(ROOT, '../shared/assets'),
    })
  })

  it('resolves against the working directory when given no root', () => {
    expect(resolveConfig(MINIMAL)).toMatchObject({
      root: process.cwd(),
      entryPath: join(process.cwd(), 'doc.tsx'),
    })
  })

  it("fills the schema's defaults, and no others", () => {
    const DEFAULTS = getDefaults(CONFIG_SCHEMA)

    // Whole-object, so a default dropped or a key added on the way fails it.
    expect(resolveConfig(MINIMAL, ROOT)).toEqual({
      ...omit(DEFAULTS, ['pageSize']),
      root: ROOT,
      entry: 'doc.tsx',
      entryPath: join(ROOT, 'doc.tsx'),
      outDir: join(ROOT, 'outputs'),
      // The entry's basename, so `doc.tsx` writes `doc.pdf`.
      name: 'doc',
      // The default `pageSize`, as the dimensions it names.
      page: PAGE_SIZES[DEFAULTS.pageSize],
    })
  })

  it('takes explicit dimensions as the sheet', () => {
    expect(
      resolveConfig({
        ...MINIMAL,
        pageSize: { width: '90mm', height: '50mm' },
      }).page
    ).toEqual({ width: '90mm', height: '50mm' })
  })

  it('names the offending key when a value is the wrong type', () => {
    expect(() =>
      // @ts-expect-error -- a string port, which only the runtime check can catch in a JS config
      resolveConfig({ ...MINIMAL, port: 'four thousand' })
    ).toThrow(/The config is invalid:\n {2}port: /)
  })

  it('rejects a page size that is neither a name nor dimensions', () => {
    expect(() =>
      // @ts-expect-error -- a size that is not one of the named sheets
      resolveConfig({ ...MINIMAL, pageSize: 'a6' })
    ).toThrow('or { width, height } as CSS lengths')
  })

  it('rejects a margin naming some sides but not all four', () => {
    expect(() =>
      // @ts-expect-error -- two sides where the object form needs all four
      resolveConfig({ ...MINIMAL, margin: { top: 1, bottom: 1 } })
    ).toThrow('{ top, right, bottom, left }')
  })

  it('rejects a negative margin, while allowing zero', () => {
    expect(() => resolveConfig({ ...MINIMAL, margin: -1 })).toThrow(/margin/)
    expect(resolveConfig({ ...MINIMAL, margin: 0 }).margin).toBe(0)
  })

  it('rejects a maxPages that is not a whole page count', () => {
    for (const maxPages of [0, 1.5]) {
      expect(
        () => resolveConfig({ ...MINIMAL, maxPages }),
        String(maxPages)
      ).toThrow(/maxPages/)
    }
  })
})

describe('loadConfig', () => {
  /**
   * Writes a config to a real directory and loads it.
   *
   * `loadConfig` reaches its file through `import()`, which goes to the real
   * loader rather than the mocked `node:fs` the rest of this file installs.
   */
  const loadFrom = async (source: string) => {
    const dir = await mkdtemp(join(tmpdir(), 'tsx-to-pdf-'))
    const path = join(dir, 'tsx-to-pdf.config.mjs')
    await writeFile(path, source)
    return { dir, config: await loadConfig(path) }
  }

  const buildConfigModule = (config: Config) =>
    `export default ${JSON.stringify(config)}`

  it('resolves the paths against the config file, not the process', async () => {
    const { dir, config } = await loadFrom(
      buildConfigModule({ entry: 'doc.tsx', outDir: 'outputs' })
    )

    expect(config).toMatchObject({
      root: dir,
      entryPath: join(dir, 'doc.tsx'),
      outDir: join(dir, 'outputs'),
    })
  })

  it('rejects a config file with no default export', async () => {
    await expect(loadFrom('export const title = "doc"')).rejects.toThrow(
      'no default export'
    )
  })

  it('names the file when its config is invalid', async () => {
    await expect(
      loadFrom(
        buildConfigModule({ entry: 'doc.tsx', outDir: 'outputs', margin: -1 })
      )
    ).rejects.toThrow(/tsx-to-pdf\.config\.mjs is invalid:/)
  })
})
