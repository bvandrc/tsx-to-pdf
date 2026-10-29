import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'

/**
 * Imports the project's TypeScript and JSX, compiled for Preact whatever its
 * tsconfig says, and with that tsconfig's `paths` and `baseUrl` resolved.
 *
 * `fresh` re-evaluates every module on each import, for a document whose files
 * are changing under it.
 */
export const createImporter = (
  root: string,
  { fresh = false }: { fresh?: boolean } = {}
): ((path: string) => Promise<unknown>) => {
  const jiti = createJiti(pathToFileURL(join(root, '/')).href, {
    jsx: { runtime: 'automatic', importSource: 'preact' },
    // Each file's imports resolve through the tsconfig nearest to it, with
    // `get-tsconfig`'s matcher: every target, a `*` anywhere, and `baseUrl`.
    tsconfigPaths: true,
    moduleCache: !fresh,
    // The module as written, `default` and named exports alike, rather than its
    // default export with the named ones merged onto it.
    interopDefault: false,
  })

  return (path) => jiti.import(path)
}
