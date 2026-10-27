import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { h } from 'preact'
import { render } from 'preact-render-to-string'

import { createImporter } from '../load-module.ts'

const ENTRY = 'doc.tsx'

const roots: string[] = []

afterAll(async () => {
  await Promise.all(
    roots.map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

/**
 * A project on disk, keyed by path relative to its root.
 *
 * Inside this package's `node_modules` rather than the system temp dir, so the
 * `preact` its JSX compiles to resolves the way it does in a consumer's project.
 */
const createProject = async (files: Record<string, string>) => {
  const root = await mkdtemp(
    join(import.meta.dirname, '../../node_modules/.tsx-to-pdf-test-')
  )
  roots.push(root)

  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), contents)
  }

  return root
}

/** The document at `ENTRY` in `root`, imported and rendered to markup. */
const getMarkup = async (root: string, entry = ENTRY) => {
  const module = (await createImporter(root)(join(root, entry))) as {
    default: () => null
  }

  return render(h(module.default, {}))
}

describe('createImporter', () => {
  it("resolves the tsconfig's paths, by prefix and exactly", async () => {
    const root = await createProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          paths: { '@/*': ['./src/*'], '~logo': ['./src/logo.tsx'] },
        },
      }),
      'src/parts/name.tsx': 'export const Name = () => <b>Ada</b>',
      'src/logo.tsx': 'export const Logo = () => <i>logo</i>',
      [ENTRY]: `import { Name } from '@/parts/name'
import { Logo } from '~logo'
export default () => <p><Name /><Logo /></p>`,
    })

    expect(await getMarkup(root)).toBe('<p><b>Ada</b><i>logo</i></p>')
  })

  it('resolves paths an extended tsconfig declares, against its baseUrl', async () => {
    // `paths` and `baseUrl` live in the base, so they resolve against the base's
    // directory, not the extending tsconfig's.
    const root = await createProject({
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: { baseUrl: './lib', paths: { '#/*': ['*'] } },
      }),
      'lib/name.tsx': 'export const Name = () => <b>Ada</b>',
      'app/tsconfig.json': JSON.stringify({ extends: '../tsconfig.base.json' }),
      [join('app', ENTRY)]: `import { Name } from '#/name'
export default () => <p><Name /></p>`,
    })

    expect(await getMarkup(join(root, 'app'))).toBe('<p><b>Ada</b></p>')
  })

  it('compiles JSX for Preact whatever the tsconfig asks for', async () => {
    const root = await createProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react' },
      }),
      [ENTRY]: 'export default () => <p>Ada</p>',
    })

    expect(await getMarkup(root)).toBe('<p>Ada</p>')
  })
})
