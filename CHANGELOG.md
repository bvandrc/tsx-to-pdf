# Changelog

All notable changes to this project are documented in this file.

## 1.5.0 — 2026-08-21

### Added

- Optional PNG and JPG output, alongside PDF and Markdown.

### Changed

- `node-html-markdown` is now a required dependency instead of an optional peer, so Markdown output works without an extra install.

## 1.4.2 — 2026-08-21

### Fixed

- A rebuild that renders unchanged HTML/CSS now reuses the previous PDF's date instead of stamping a new one.

## 1.4.1 — 2026-08-20

### Fixed

- Tailwind class scanning now follows a document's local imports, so classes used only in imported components are no longer dropped.

## 1.4.0 — 2026-08-18

### Added

- A config option to omit the PDF's creation/modification dates entirely, instead of stamping the Unix epoch.

## 1.3.0 — 2026-08-18

### Added

- Optional Markdown output, derived from the rendered page.

## 1.2.1 — 2026-08-13

### Fixed

- Playwright now installs the full Chromium build instead of the headless shell, which laid text out slightly differently.

## 1.2.0 — 2026-08-13

### Added

- Page margin config.

## 1.1.1 — 2026-08-13

### Fixed

- The page break is now marked in the live preview.

## 1.1.0 — 2026-08-13

### Added

- PDF author metadata.

## 1.0.0 — 2026-08-13

### Added

- Initial release: the document generator extracted into its own package — JSX documents styled with Tailwind, rendered to HTML, and generated as a page-exact PDF by headless Chromium.
