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
import { omit } from 'es-toolkit'
import type { SetRequired } from 'type-fest'
import {
  boolean,
  getDotPath,
  type InferInput,
  type InferOutput,
  instance,
  integer,
  minValue,
  number,
  object,
  optional,
  picklist,
  pipe,
  safeParse,
  strictObject,
  string,
  union,
} from 'valibot'

import { typedKeys } from './utils/index.ts'

/** A length in inches. Zero is a legitimate margin; negative is not. */
const INCHES = pipe(number(), minValue(0))

const PAGE_DIMENSIONS_SCHEMA = object({ width: string(), height: string() })

/** A sheet, as CSS lengths. */
export type PageDimensions = InferOutput<typeof PAGE_DIMENSIONS_SCHEMA>

export const PAGE_SIZES = {
  letter: { width: '8.5in', height: '11in' },
  legal: { width: '8.5in', height: '14in' },
  tabloid: { width: '11in', height: '17in' },
  a3: { width: '297mm', height: '420mm' },
  a4: { width: '210mm', height: '297mm' },
  a5: { width: '148mm', height: '210mm' },
} as const satisfies Record<string, PageDimensions>

export type PageSize = keyof typeof PAGE_SIZES

/** The names, as a value, so the schema and its message can both read them. */
const PAGE_SIZE_NAMES = typedKeys(PAGE_SIZES)

const PAGE_SIZE_SCHEMA = union(
  [picklist(PAGE_SIZE_NAMES), PAGE_DIMENSIONS_SCHEMA],
  `Expected ${PAGE_SIZE_NAMES.join(', ')}, or { width, height } as CSS lengths`
)

/** A named page size, or explicit CSS dimensions. */
type PageSizeArg = InferOutput<typeof PAGE_SIZE_SCHEMA>

const MARGIN_SCHEMA = union(
  [
    INCHES,
    // All four required, and strict: naming some sides but not others reads
    // as "the rest are zero" as easily as "the rest are the default", so it
    // is an error rather than a guess. A misspelled side fails here too.
    strictObject({
      top: INCHES,
      right: INCHES,
      bottom: INCHES,
      left: INCHES,
    }),
  ],
  'Expected inches as a number, or { top, right, bottom, left }'
)

/** White space around the document, in inches: one value, or all four sides. */
export type Margin = InferOutput<typeof MARGIN_SCHEMA>

/** The config as a runtime check. */
// The source of `Config` and `ResolvedConfig`, so each entry's JSDoc is what a
// consumer's editor shows on that key.
const CONFIG_SCHEMA = object({
  /** A module default-exporting the component, and exporting a `title`. */
  entry: string(),
  /**
   * The document's stylesheet, imported into the page's own CSS.
   *
   * Not required — Tailwind's utilities and the sheet itself are there either
   * way, so a document that only uses classes needs no stylesheet of its own.
   */
  styles: optional(string()),
  /** Directory copied in beside the rendered page. */
  assets: optional(string()),
  /** Where the rendered files land. */
  outDir: string(),
  /**
   * Basename they are given: `<name>.pdf`, `<name>.html`, `<name>.css`.
   *
   * @default the basename of `entry`
   */
  name: optional(string()),
  /**
   * A named page size, or explicit CSS dimensions.
   *
   * @default 'letter'
   */
  pageSize: optional(PAGE_SIZE_SCHEMA),
  /**
   * White space around the document, in inches — one number for all four sides,
   * or an object giving every side.
   *
   * Applied as the page's padding, so a full-width banner still sits inside it.
   *
   * @default 1
   */
  margin: optional(MARGIN_SCHEMA),
  /**
   * Trigger failure if the build exceeds this many pages.
   *
   * @default undefined — the length is not checked
   */
  maxPages: optional(pipe(number(), integer(), minValue(1))),
  /**
   * Fail when a font is embedded as Type3, which text extractors read poorly.
   *
   * Chromium does this for any font it cannot embed — a variable font, for one.
   * Turn it off if you would rather have the PDF anyway.
   *
   * @default true
   */
  checkPdfFontTypes: optional(boolean()),
  /**
   * `/Author` in the PDF: the person who wrote the document.
   *
   * Left unset by default.
   */
  author: optional(string()),
  /**
   * Stamp `/CreationDate` and `/ModDate`:
   * - `true` — the time of the build
   * - a `Date` — that instant instead
   * - `false` — omit them, for a build that has to be reproducible — a
   *   byte-identical rebuild of unchanged source, which a live date can
   *   never be twice
   *
   * @default true
   */
  setDate: optional(
    union(
      [boolean(), instance(Date)],
      'Expected a boolean, or a Date to set it to'
    )
  ),
  /**
   * Port for `tsx-to-pdf dev`.
   *
   * @cli `--port`
   * @default 4000
   */
  port: optional(pipe(number(), integer())),
})

/** Which document to render and how. Paths are relative to the config file. */
export type Config = InferInput<typeof CONFIG_SCHEMA>

/** `Config` as the schema hands it back once it has checked it. */
type ParsedConfig = InferOutput<typeof CONFIG_SCHEMA>

/**
 * Paths resolved, and the defaults more than one caller needs filled in.
 *
 * The rest are defaulted where they are read, against the same value `Config`
 * documents.
 */
export type ResolvedConfig = SetRequired<
  Omit<ParsedConfig, 'assets' | 'pageSize'>,
  'name' | 'port' | 'setDate'
> & {
  /** The config file's directory. Relative paths resolve against it. */
  root: string
  /** `entry` and `assets` resolved. `styles` is only ever needed relative. */
  entryPath: string
  assetsDir?: string
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

/** `letter` and the rest resolved to the lengths the stylesheet is built from. */
const toDimensions = (pageSize: PageSizeArg = 'letter'): PageDimensions =>
  typeof pageSize === 'string' ? PAGE_SIZES[pageSize] : pageSize

/**
 * Reads the config at `path`, resolves its paths, and fills in its defaults.
 *
 * Loading a TypeScript config needs `tsx` registered first, which the CLI does
 * — hence taking the path rather than finding it here, so registration can
 * happen in between.
 */
export const loadConfig = async (path: string): Promise<ResolvedConfig> => {
  const root = dirname(path)

  const module = (await import(pathToFileURL(path).href)) as {
    default?: Partial<Config>
  }

  if (!module.default) {
    throw new Error(`${path} has no default export.`)
  }

  const result = safeParse(CONFIG_SCHEMA, module.default)

  if (!result.success) {
    throw new Error(
      `${path} is invalid:\n${result.issues
        .map(
          (issue) => `  ${getDotPath(issue) ?? '(config)'}: ${issue.message}`
        )
        .join('\n')}`
    )
  }

  const config = result.output

  return {
    // Everything the build takes as given.
    ...omit(config, [
      // Come back resolved below, as `assetsDir` and `page`.
      'assets',
      'pageSize',
    ]),
    root,
    entryPath: resolve(root, config.entry),
    assetsDir: config.assets ? resolve(root, config.assets) : undefined,
    outDir: resolve(root, config.outDir),
    // `resume.tsx` gives `resume.pdf`, which is what you would have named it.
    name: config.name ?? basename(config.entry, extname(config.entry)),
    page: toDimensions(config.pageSize),
    port: config.port ?? 4000,
    setDate: config.setDate ?? true,
  }
}
