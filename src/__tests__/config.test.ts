import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vol } from 'memfs'

import { findConfig, loadConfig, PAGE_SIZES } from '../config.ts'

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs')
  return { ...fs, default: fs }
})

/** A minimal valid config, as the object a config file default-exports. */
const MINIMAL = { entry: 'doc.tsx', outDir: 'outputs' }

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

const exporting = (config: unknown) =>
  `export default ${JSON.stringify(config)}`

describe('findConfig', () => {
  beforeEach(() => {
    vol.reset()
  })

  it('accepts the other extensions a config may use', () => {
    for (const extension of ['mts', 'js', 'mjs']) {
      vol.reset()
      vol.fromJSON({ [`/project/tsx-to-pdf.config.${extension}`]: '' })

      expect(findConfig(undefined, '/project'), extension).toBe(
        `/project/tsx-to-pdf.config.${extension}`
      )
    }
  })

  it('names the missing path when an explicit config is not there', () => {
    expect(() => findConfig('missing.config.ts', '/project')).toThrow(
      'No config at /project/missing.config.ts'
    )
  })

  it('says what to create when a project has no config at all', () => {
    expect(() => findConfig(undefined, '/project')).toThrow(
      'No config found in /project. Create tsx-to-pdf.config.ts, or pass --config <path>.'
    )
  })
})

describe('loadConfig', () => {
  it('resolves the paths against the config file, not the process', async () => {
    const { dir, config } = await loadFrom(
      exporting({ ...MINIMAL, assets: '../shared/assets' })
    )

    expect(config).toMatchObject({
      root: dir,
      entryPath: join(dir, 'doc.tsx'),
      outDir: join(dir, 'outputs'),
      assetsDir: join(dir, '../shared/assets'),
    })
  })

  it('fills the defaults a caller would otherwise have to know', async () => {
    const { config } = await loadFrom(exporting(MINIMAL))

    expect(config).toMatchObject({
      // The entry's basename, so `doc.tsx` writes `doc.pdf`.
      name: 'doc',
      page: PAGE_SIZES.letter,
      port: 4000,
      setDate: true,
    })
  })

  it('takes explicit dimensions as the sheet', async () => {
    const { config } = await loadFrom(
      exporting({ ...MINIMAL, pageSize: { width: '90mm', height: '50mm' } })
    )

    expect(config.page).toEqual({ width: '90mm', height: '50mm' })
  })

  it('rejects a config file with no default export', async () => {
    await expect(loadFrom('export const title = "doc"')).rejects.toThrow(
      'has no default export.'
    )
  })

  it('names the offending key when a value is the wrong type', async () => {
    await expect(
      loadFrom(exporting({ ...MINIMAL, port: 'four thousand' }))
    ).rejects.toThrow(/port: /)
  })

  it('rejects a page size that is neither a name nor dimensions', async () => {
    await expect(
      loadFrom(exporting({ ...MINIMAL, pageSize: 'a6' }))
    ).rejects.toThrow(
      'Expected letter, legal, tabloid, a3, a4, a5, or { width, height } as CSS lengths'
    )
  })

  it('rejects a margin naming some sides but not all four', async () => {
    await expect(
      loadFrom(exporting({ ...MINIMAL, margin: { top: 1, bottom: 1 } }))
    ).rejects.toThrow(
      'Expected inches as a number, or { top, right, bottom, left }'
    )
  })

  it('rejects a negative margin, while allowing zero', async () => {
    await expect(
      loadFrom(exporting({ ...MINIMAL, margin: -1 }))
    ).rejects.toThrow(/margin/)

    const { config } = await loadFrom(exporting({ ...MINIMAL, margin: 0 }))
    expect(config.margin).toBe(0)
  })

  it('rejects a maxPages that is not a whole page count', async () => {
    for (const maxPages of [0, 1.5]) {
      await expect(
        loadFrom(exporting({ ...MINIMAL, maxPages })),
        String(maxPages)
      ).rejects.toThrow(/maxPages/)
    }
  })
})
