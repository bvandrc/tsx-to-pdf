//#region src/config.d.ts
/** A sheet, as CSS lengths. */
type PageDimensions = {
  width: string;
  height: string;
};
declare const PAGE_SIZES: {
  readonly letter: {
    readonly width: '8.5in';
    readonly height: '11in';
  };
  readonly legal: {
    readonly width: '8.5in';
    readonly height: '14in';
  };
  readonly tabloid: {
    readonly width: '11in';
    readonly height: '17in';
  };
  readonly a3: {
    readonly width: '297mm';
    readonly height: '420mm';
  };
  readonly a4: {
    readonly width: '210mm';
    readonly height: '297mm';
  };
  readonly a5: {
    readonly width: '148mm';
    readonly height: '210mm';
  };
};
type PageSize = keyof typeof PAGE_SIZES;
/** Which document to render and how. Paths are relative to the config file. */
type Config = {
  /** A module default-exporting the component, and exporting a `title`. */
  entry: string;
  /** The document's stylesheet, imported into the page's own CSS. */
  styles: string;
  /** Directory copied in beside the rendered page. */
  assets: string;
  /** Where the rendered files land. */
  outDir: string;
  /**
   * Basename they are given: `<name>.pdf`, `<name>.html`, `<name>.css`.
   * Defaults to the entry's own basename.
   */
  name?: string;
  /** A named sheet, or explicit CSS lengths. Defaults to `letter`. */
  pageSize?: PageSize | PageDimensions;
  /** Building past this many pages fails. Unset, the length is not checked. */
  maxPages?: number;
  /**
   * Fail when a font is embedded as Type3, which text extractors read poorly.
   * Chromium does this for any font it cannot embed — a variable font, for one.
   * Defaults to true; turn it off if you would rather have the PDF anyway.
   */
  checkPdfFontTypes?: boolean;
  /**
   * `/Producer` and `/Creator` in the PDF, which readers show under document
   * properties. Chromium writes its own renderer version and a timestamp there;
   * both vary per run, so this is overwritten with something fixed. Defaults to
   * `tsx-to-pdf` — set it to your own name to keep the tool out of the file.
   */
  producer?: string;
  /** Port for `tsx-to-pdf dev`. Defaults to 4000. */
  port?: number;
};
declare const defineConfig: (config: Config) => Config;
/** Defaults filled in and paths resolved, which is what the build works from. */
type ResolvedConfig = Required<Pick<Config, 'name' | 'port' | 'checkPdfFontTypes' | 'producer'>> & Pick<Config, 'entry' | 'styles' | 'maxPages'> & {
  /** The config file's directory. Relative paths resolve against it. */
  root: string;
  /** The same three, resolved. `styles` is only ever needed relative. */
  entryPath: string;
  assetsDir: string;
  outDir: string;
  /** `pageSize` with the named sheets looked up. */
  page: PageDimensions;
};
/** Where the config lives: `--config` if given, else the nearest one at `from`. */
declare const findConfig: (explicit?: string, from?: string) => string;
/**
 * Reads the config at `path` and fills in its defaults. Loading a TypeScript
 * config needs `tsx` registered first, which the CLI does — hence taking the
 * path rather than finding it here, so registration can happen in between.
 */
declare const loadConfig: (path: string) => Promise<ResolvedConfig>;
//#endregion
//#region src/build.d.ts
/**
 * Renders the configured document to `outDir`, and returns what it wrote.
 * With `pdf: false` it skips the browser, which is enough to tell whether the
 * source changed.
 */
declare const build: (config: ResolvedConfig, { pdf }?: {
  pdf?: boolean;
}) => Promise<string[]>;
//#endregion
//#region src/dev-server.d.ts
/**
 * Serves the document at its exact printed dimensions on a page-like backdrop, so
 * the preview is the PDF rather than an approximation of it.
 *
 * Nothing is compiled up front — every request builds, so a reload cannot serve
 * a stale page or stale CSS.
 */
declare const serve: (config: ResolvedConfig) => void;
//#endregion
export { type Config, type ResolvedConfig, build, defineConfig, findConfig, loadConfig, serve };