/** Components a test entry can import: each one's source, the markup it renders, and its import statement. */
export const COMPONENTS = {
  NAME: {
    SOURCE: 'export const Name = () => <b>Ada</b>',
    MARKUP: '<b>Ada</b>',
    importFrom: (specifier: string) => `import { Name } from '${specifier}'`,
  },
} as const

/**
 * An entry file that runs `imports`, then default-exports a component rendering `jsx`.
 *
 * It has no `title`, so it is enough to import or scan, but not a document `buildPage` accepts.
 */
export const buildEntry = (jsx: string, imports: string[] = []) =>
  [...imports, `export default () => ${jsx}`].join('\n')
