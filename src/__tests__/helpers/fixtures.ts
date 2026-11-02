/** Components a test document can import: each one's source, and the markup it renders. */
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

/** A document module that runs `imports`, then default-exports a component rendering `jsx`. */
export const buildDocument = (jsx: string, imports: string[] = []) =>
  [...imports, `export default () => ${jsx}`].join('\n')
