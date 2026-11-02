import { join } from 'node:path'
import { h } from 'preact'
import { render } from 'preact-render-to-string'
import type { TsConfigJson } from 'type-fest'

import { createImporter } from '../load-module.ts'
import { createDirTree } from './helpers/create-dir-tree.ts'
import { buildEntry, COMPONENTS } from './helpers/fixtures.ts'

const ENTRY = 'doc.tsx'
const { NAME } = COMPONENTS

/** `tsconfig` as the file's contents, checked against the tsconfig schema. */
const buildTsconfig = (tsconfig: TsConfigJson) => JSON.stringify(tsconfig)

/** The document at `ENTRY` in `root`, imported and rendered to markup. */
const getMarkup = async (root: string) => {
  const module = (await createImporter(root, { cacheModules: true })(
    join(root, ENTRY)
  )) as {
    default: () => null
  }

  return render(h(module.default, {}))
}

describe('createImporter', () => {
  // How a pattern matches is jiti's to test. This pins only that it is on.
  it("resolves the tsconfig's paths", async () => {
    const root = await createDirTree({
      'tsconfig.json': buildTsconfig({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
      }),
      'src/name.tsx': NAME.SOURCE,
      [ENTRY]: buildEntry('<p><Name /></p>', [NAME.importFrom('@/name')]),
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
