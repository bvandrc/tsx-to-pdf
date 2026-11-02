/** Components a test entry can import: each one's source, and the markup it renders. */
export const COMPONENTS = {
  NAME: {
    SOURCE: 'export const Name = () => <b>Ada</b>',
    MARKUP: '<b>Ada</b>',
  },
  LOGO: {
    SOURCE: 'export const Logo = () => <i>logo</i>',
    MARKUP: '<i>logo</i>',
  },
} as const

/**
 * An entry file that runs `imports`, then default-exports a component rendering `jsx`.
 *
 * It has no `title`, so it is enough to import or scan, but not a document `buildPage` accepts.
 */
export const buildEntry = (jsx: string, imports: string[] = []) =>
  [...imports, `export default () => ${jsx}`].join('\n')
