import { join } from 'node:path'
import { h } from 'preact'
import { render } from 'preact-render-to-string'
import type { TsConfigJson } from 'type-fest'

import { createImporter } from '../load-module.ts'
import { createDirTree } from './helpers/create-dir-tree.ts'
import { buildEntry, COMPONENTS } from './helpers/fixtures.ts'

const ENTRY = 'doc.tsx'
const { NAME, LOGO } = COMPONENTS

/** `tsconfig` as the file's contents, checked against the tsconfig schema. */
const buildTsconfig = (tsconfig: TsConfigJson) => JSON.stringify(tsconfig)

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
      'tsconfig.json': buildTsconfig({
        compilerOptions: {
          paths: { '@/*': ['./src/*'], '~logo': ['./src/logo.tsx'] },
        },
      }),
      'src/parts/name.tsx': NAME.SOURCE,
      'src/logo.tsx': LOGO.SOURCE,
      [ENTRY]: buildEntry('<p><Name /><Logo /></p>', [
        NAME.importFrom('@/parts/name'),
        LOGO.importFrom('~logo'),
      ]),
    })

    expect(await getMarkup(root)).toBe(`<p>${NAME.MARKUP}${LOGO.MARKUP}</p>`)
  })

  it('resolves paths an extended tsconfig declares, against its baseUrl', async () => {
    // `paths` and `baseUrl` live in the base, so they resolve against the base's
    // directory, not the extending tsconfig's.
    const root = await createDirTree({
      'tsconfig.base.json': buildTsconfig({
        compilerOptions: { baseUrl: './lib', paths: { '#/*': ['*'] } },
      }),
      'lib/name.tsx': NAME.SOURCE,
      'app/tsconfig.json': buildTsconfig({ extends: '../tsconfig.base.json' }),
      [join('app', ENTRY)]: buildEntry('<p><Name /></p>', [
        NAME.importFrom('#/name'),
      ]),
    })

    expect(await getMarkup(join(root, 'app'))).toBe(`<p>${NAME.MARKUP}</p>`)
  })

  it("resolves a pattern whose prefix doesn't end in a slash", async () => {
    const root = await createDirTree({
      'tsconfig.json': buildTsconfig({
        compilerOptions: { paths: { '#*': ['./src/*'] } },
      }),
      'src/name.tsx': NAME.SOURCE,
      [ENTRY]: buildEntry('<p><Name /></p>', [NAME.importFrom('#name')]),
    })

    expect(await getMarkup(root)).toBe(`<p>${NAME.MARKUP}</p>`)
  })

  it('resolves a bare import against baseUrl alone', async () => {
    const root = await createDirTree({
      'tsconfig.json': buildTsconfig({ compilerOptions: { baseUrl: '.' } }),
      'lib/name.tsx': NAME.SOURCE,
      [ENTRY]: buildEntry('<p><Name /></p>', [NAME.importFrom('lib/name')]),
    })

    expect(await getMarkup(root)).toBe(`<p>${NAME.MARKUP}</p>`)
  })

  it('compiles JSX for Preact whatever the tsconfig asks for', async () => {
    const root = await createDirTree({
      'tsconfig.json': buildTsconfig({
        compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react' },
      }),
      [ENTRY]: buildEntry(`<p>${NAME.MARKUP}</p>`),
    })

    expect(await getMarkup(root)).toBe(`<p>${NAME.MARKUP}</p>`)
  })
})
