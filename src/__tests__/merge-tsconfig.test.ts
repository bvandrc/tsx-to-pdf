import { vol } from 'memfs'

import { jsxTsconfig } from '../merge-tsconfig.ts'

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs')
  return { ...fs, default: fs }
})
vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs')
  return { ...fs.promises, default: fs.promises }
})

/** The tsconfig `jsxTsconfig` wrote, parsed. */
const written = (path: string) =>
  JSON.parse(vol.readFileSync(path, 'utf8') as string)

describe('jsxTsconfig', () => {
  beforeEach(() => {
    vol.reset()
  })

  it('writes the config inside the project it is given', async () => {
    vol.fromJSON({ '/project/package.json': '{}' })

    expect(await jsxTsconfig('/project')).toBe(
      '/project/node_modules/.tsx-to-pdf/tsconfig.json'
    )
  })

  it('pins the JSX settings a Preact render needs', async () => {
    vol.fromJSON({ '/project/package.json': '{}' })

    expect(written(await jsxTsconfig('/project'))).toMatchObject({
      compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'preact' },
    })
  })

  it("widens `include` to the whole project, not just the entry's folder", async () => {
    vol.fromJSON({ '/project/package.json': '{}' })

    // tsx applies a tsconfig only to the files its `include` matches, so a
    // document outside the project's own `src` would otherwise get no settings.
    expect(written(await jsxTsconfig('/project'))).toMatchObject({
      include: ['../../**/*'],
    })
  })

  it("extends the project's tsconfig, so its paths and target survive", async () => {
    vol.fromJSON({ '/project/tsconfig.json': '{}' })

    expect(written(await jsxTsconfig('/project'))).toMatchObject({
      extends: '../../tsconfig.json',
    })
  })

  it('falls back to a jsconfig where that is what the project has', async () => {
    vol.fromJSON({ '/project/jsconfig.json': '{}' })

    expect(written(await jsxTsconfig('/project'))).toMatchObject({
      extends: '../../jsconfig.json',
    })
  })

  it('prefers the tsconfig when a project carries both', async () => {
    vol.fromJSON({
      '/project/jsconfig.json': '{}',
      '/project/tsconfig.json': '{}',
    })

    expect(written(await jsxTsconfig('/project'))).toMatchObject({
      extends: '../../tsconfig.json',
    })
  })

  it('extends nothing when the project has no config of its own', async () => {
    vol.fromJSON({ '/project/package.json': '{}' })

    expect(written(await jsxTsconfig('/project'))).not.toHaveProperty('extends')
  })

  it('creates the directory rather than failing when node_modules is bare', async () => {
    vol.fromJSON({ '/project/package.json': '{}' })

    await jsxTsconfig('/project')

    expect(vol.existsSync('/project/node_modules/.tsx-to-pdf')).toBe(true)
  })
})
