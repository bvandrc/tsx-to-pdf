import { join } from 'node:path'
import { h } from 'preact'
import { render } from 'preact-render-to-string'

import { createImporter } from '../load-module.ts'
import { createDirTree } from './helpers/create-dir-tree.ts'
import { buildDocument, COMPONENTS } from './helpers/fixtures.ts'

const ENTRY = 'doc.tsx'
const { NAME, LOGO } = COMPONENTS

/** The document at `ENTRY` in `root`, imported and rendered to markup. */
const getMarkup = async (root: string, entry = ENTRY) => {
  const module = (await createImporter(root, { cacheModules: true })(
    join(root, entry)
  )) as {
    default: () => null
  }

  return render(h(module.default, {}))
}

describe('createImporter', () => {
  it("resolves the tsconfig's paths, by prefix and exactly", async () => {
    const root = await createDirTree({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          paths: { '@/*': ['./src/*'], '~logo': ['./src/logo.tsx'] },
        },
      }),
      'src/parts/name.tsx': NAME.SOURCE,
      'src/logo.tsx': LOGO.SOURCE,
      [ENTRY]: buildDocument('<p><Name /><Logo /></p>', [
        "import { Name } from '@/parts/name'",
        "import { Logo } from '~logo'",
      ]),
    })

    expect(await getMarkup(root)).toBe(`<p>${NAME.MARKUP}${LOGO.MARKUP}</p>`)
  })

  it('resolves paths an extended tsconfig declares, against its baseUrl', async () => {
    // `paths` and `baseUrl` live in the base, so they resolve against the base's
    // directory, not the extending tsconfig's.
    const root = await createDirTree({
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: { baseUrl: './lib', paths: { '#/*': ['*'] } },
      }),
      'lib/name.tsx': NAME.SOURCE,
      'app/tsconfig.json': JSON.stringify({ extends: '../tsconfig.base.json' }),
      [join('app', ENTRY)]: buildDocument('<p><Name /></p>', [
        "import { Name } from '#/name'",
      ]),
    })

    expect(await getMarkup(join(root, 'app'))).toBe(`<p>${NAME.MARKUP}</p>`)
  })

  it("resolves a pattern whose prefix doesn't end in a slash", async () => {
    const root = await createDirTree({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '#*': ['./src/*'] } },
      }),
      'src/name.tsx': NAME.SOURCE,
      [ENTRY]: buildDocument('<p><Name /></p>', [
        "import { Name } from '#name'",
      ]),
    })

    expect(await getMarkup(root)).toBe(`<p>${NAME.MARKUP}</p>`)
  })

  it('resolves a bare import against baseUrl alone', async () => {
    const root = await createDirTree({
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.' } }),
      'lib/name.tsx': NAME.SOURCE,
      [ENTRY]: buildDocument('<p><Name /></p>', [
        "import { Name } from 'lib/name'",
      ]),
    })

    expect(await getMarkup(root)).toBe(`<p>${NAME.MARKUP}</p>`)
  })

  it('compiles JSX for Preact whatever the tsconfig asks for', async () => {
    const root = await createDirTree({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react' },
      }),
      [ENTRY]: buildDocument(`<p>${NAME.MARKUP}</p>`),
    })

    expect(await getMarkup(root)).toBe(`<p>${NAME.MARKUP}</p>`)
  })
})
