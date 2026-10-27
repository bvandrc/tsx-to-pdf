import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPathsMatcher, getTsconfig } from 'get-tsconfig'
import { createJiti } from 'jiti'

/** Stands in for what a `paths` wildcard captures, so its target's prefix can be read off. */
const CAPTURE = '__tsx_to_pdf_capture__'

/**
 * The project's tsconfig `paths`, as the prefix aliases `jiti` takes.
 *
 * Only a trailing `*` maps to a prefix, so a pattern with one elsewhere is left
 * out, as is a bare `*`, which would alias every import. Where a pattern lists
 * fallback targets, the first is taken.
 */
const pathAliases = (root: string): Record<string, string> => {
  const tsconfig = getTsconfig(root) ?? getTsconfig(root, 'jsconfig.json')
  // The matcher resolves each target the way TypeScript does, against `baseUrl`
  // or the tsconfig that declared `paths`, through any `extends` chain.
  const match = tsconfig && createPathsMatcher(tsconfig)

  if (!tsconfig || !match) {
    return {}
  }

  return Object.fromEntries(
    Object.keys(tsconfig.config.compilerOptions?.paths ?? {}).flatMap(
      (pattern) => {
        if (!pattern.includes('*')) {
          const [target] = match(pattern)
          return target ? [[pattern, target]] : []
        }

        if (pattern === '*' || pattern.indexOf('*') !== pattern.length - 1) {
          return []
        }

        const [target] = match(pattern.replace('*', CAPTURE))
        return target?.endsWith(CAPTURE)
          ? [[pattern.slice(0, -1), target.slice(0, -CAPTURE.length)]]
          : []
      }
    )
  )
}

/**
 * Imports the project's TypeScript and JSX, compiled for Preact whatever its
 * tsconfig says, and with that tsconfig's `paths` resolved.
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
    alias: pathAliases(root),
    moduleCache: !fresh,
    // The module as written, `default` and named exports alike, rather than its
    // default export with the named ones merged onto it.
    interopDefault: false,
  })

  return (path) => jiti.import(path)
}
