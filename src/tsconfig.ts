/**
 * @file The tsconfig `tsx` transforms the consumer's files with.
 *
 * The document is JSX, so loading it needs `jsx` and `jsxImportSource` set — but
 * a project is not required to have a tsconfig, and one that does is not
 * required to have those right. Rather than making that the consumer's problem,
 * the settings are generated here and handed to `tsx` directly, layered on top
 * of whatever the project already has.
 */

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/** Without these the document compiles for React and fails at render. */
const JSX_OPTIONS = {
  jsx: 'react-jsx',
  jsxImportSource: 'preact',
} as const

const PROJECT_TSCONFIGS = ['tsconfig.json', 'jsconfig.json']

/** `extends` is resolved as a POSIX path, on Windows too. */
const posix = (path: string): string => path.split(sep).join('/')

/**
 * Writes a tsconfig that pins the JSX settings on top of the project's own, and
 * returns its path for `tsx`'s `register`.
 *
 * tsx applies a single tsconfig to everything it transforms, so pointing it
 * straight at the project's would leave the JSX settings to chance — they have
 * to be set, and `include` has to happen to match the document. Extending gives
 * both: ours always apply, and the project keeps its `paths`, `target` and the
 * rest.
 */
export const jsxTsconfig = async (root: string): Promise<string> => {
  const pkgDir = join(root, 'node_modules', '.tsx-to-pdf')
  await mkdir(pkgDir, { recursive: true }) // create if doesn't exist
  const pkgDirRel = (target: string) => posix(relative(pkgDir, target))

  const tsconfigPath = join(pkgDir, 'tsconfig.json')

  const projectConfig = PROJECT_TSCONFIGS.map((name) => join(root, name)).find(
    existsSync
  )

  // create the tsconfig in node_modules .
  await writeFile(
    tsconfigPath,
    `${JSON.stringify(
      {
        ...(projectConfig && { extends: pkgDirRel(projectConfig) }),
        compilerOptions: JSX_OPTIONS,
        // `extends` inherits the project's `include`, and tsx only applies a
        // tsconfig to files that one matches — so a project scoped to `src` would
        // leave a document elsewhere with no JSX settings. Widening it here is
        // what makes the document's location stop mattering.
        include: [`${pkgDirRel(root)}/**/*`],
      },
      null,
      2
    )}\n`
  )

  return tsconfigPath
}
