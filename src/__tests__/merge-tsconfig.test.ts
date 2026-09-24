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

  it('pins the JSX settings over the project, reaching the whole of it', async () => {
    vol.fromJSON({ '/project/tsconfig.json': '{}' })

    expect(written(await jsxTsconfig('/project'))).toMatchObject({
      // Without these the document compiles for React and fails at render.
      compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'preact' },
      // tsx applies a tsconfig only to the files its `include` matches, so a
      // document outside the project's own `src` would otherwise get none.
      include: ['../../**/*'],
      // Relative to `node_modules/.tsx-to-pdf/`, and POSIX on Windows too.
      extends: '../../tsconfig.json',
    })
  })

  it('extends nothing when the project has no config of its own', async () => {
    vol.fromJSON({ '/project/package.json': '{}' })

    expect(written(await jsxTsconfig('/project'))).not.toHaveProperty('extends')
  })
})
