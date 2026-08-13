import { existsSync } from 'node:fs'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'node:path'
import { pathToFileURL } from 'node:url'

/** A sheet, as CSS lengths. */
export type PageDimensions = { width: string; height: string }

export const PAGE_SIZES = {
  letter: { width: '8.5in', height: '11in' },
  legal: { width: '8.5in', height: '14in' },
  tabloid: { width: '11in', height: '17in' },
  a3: { width: '297mm', height: '420mm' },
  a4: { width: '210mm', height: '297mm' },
  a5: { width: '148mm', height: '210mm' },
} as const satisfies Record<string, PageDimensions>

export type PageSize = keyof typeof PAGE_SIZES

/** Which document to render and how. Paths are relative to the config file. */
export type Config = {
  /** A module default-exporting the component, and exporting a `title`. */
  entry: string
  /** The document's stylesheet, imported into the page's own CSS. */
  styles: string
  /** Directory copied in beside the rendered page. */
  assets: string
  /** Where the rendered files land. */
  outDir: string
  /**
   * Basename they are given: `<name>.pdf`, `<name>.html`, `<name>.css`.
   * Defaults to the entry's own basename.
   */
  name?: string
  /** A named sheet, or explicit CSS lengths. Defaults to `letter`. */
  pageSize?: PageSize | PageDimensions
  /** Building past this many pages fails. Unset, the length is not checked. */
  maxPages?: number
  /**
   * Fail when a font is embedded as Type3, which text extractors read poorly.
   * Chromium does this for any font it cannot embed — a variable font, for one.
   * Defaults to true; turn it off if you would rather have the PDF anyway.
   */
  checkPdfFontTypes?: boolean
  /**
   * `/Producer` and `/Creator` in the PDF, which readers show under document
   * properties. Chromium writes its own renderer version and a timestamp there;
   * both vary per run, so this is overwritten with something fixed. Defaults to
   * `tsx-to-pdf` — set it to your own name to keep the tool out of the file.
   */
  producer?: string
  /** Port for `tsx-to-pdf dev`. Defaults to 4000. */
  port?: number
}

export const defineConfig = (config: Config): Config => config

/** Defaults filled in and paths resolved, which is what the build works from. */
export type ResolvedConfig = Required<
  Pick<Config, 'name' | 'port' | 'checkPdfFontTypes' | 'producer'>
> &
  // Kept relative as written, for the `@source`/`@import` Tailwind compiles.
  // `maxPages` stays optional — unset means unlimited, which no default states.
  Pick<Config, 'entry' | 'styles' | 'maxPages'> & {
    /** The config file's directory. Relative paths resolve against it. */
    root: string
    /** The same three, resolved. `styles` is only ever needed relative. */
    entryPath: string
    assetsDir: string
    outDir: string
    /** `pageSize` with the named sheets looked up. */
    page: PageDimensions
  }

const CONFIG_BASENAME = 'tsx-to-pdf.config'
const CONFIG_EXTENSIONS = ['ts', 'mts', 'js', 'mjs']

const CONFIG_NAMES = CONFIG_EXTENSIONS.map(
  (extension) => `${CONFIG_BASENAME}.${extension}`
)

/** Where the config lives: `--config` if given, else the nearest one at `from`. */
export const findConfig = (explicit?: string, from = process.cwd()): string => {
  if (explicit) {
    const path = isAbsolute(explicit) ? explicit : resolve(from, explicit)

    if (!existsSync(path)) {
      throw new Error(`No config at ${path}`)
    }

    return path
  }

  const found = CONFIG_NAMES.map((name) => join(from, name)).find((path) =>
    existsSync(path)
  )

  if (!found) {
    throw new Error(
      `No config found in ${from}. Create ${CONFIG_NAMES[0]}, or pass --config <path>.`
    )
  }

  return found
}

const REQUIRED = ['entry', 'styles', 'assets', 'outDir'] as const

const dimensions = (
  pageSize: Config['pageSize'] = 'letter'
): PageDimensions => {
  if (typeof pageSize !== 'string') return pageSize

  const named = PAGE_SIZES[pageSize]

  if (!named) {
    throw new Error(
      `Unknown pageSize ${JSON.stringify(pageSize)}. Use one of ` +
        `${Object.keys(PAGE_SIZES).join(', ')}, or { width, height }.`
    )
  }

  return named
}

/**
 * Reads the config at `path` and fills in its defaults. Loading a TypeScript
 * config needs `tsx` registered first, which the CLI does — hence taking the
 * path rather than finding it here, so registration can happen in between.
 */
export const loadConfig = async (path: string): Promise<ResolvedConfig> => {
  const root = dirname(path)

  const module = (await import(pathToFileURL(path).href)) as {
    default?: Partial<Config>
  }

  const config = module.default

  if (!config) {
    throw new Error(`${path} has no default export.`)
  }

  const missing = REQUIRED.filter((key) => typeof config[key] !== 'string')

  if (missing.length > 0) {
    throw new Error(`${path} is missing: ${missing.join(', ')}.`)
  }

  const { entry, styles, assets, outDir, name } = config as Config

  return {
    root,
    entry,
    styles,
    entryPath: resolve(root, entry),
    assetsDir: resolve(root, assets),
    outDir: resolve(root, outDir),
    // `resume.tsx` gives `resume.pdf`, which is what you would have named it.
    name: name ?? basename(entry, extname(entry)),
    page: dimensions(config.pageSize),
    maxPages: config.maxPages,
    checkPdfFontTypes: config.checkPdfFontTypes ?? true,
    producer: config.producer ?? 'tsx-to-pdf',
    port: config.port ?? 4000,
  }
}
