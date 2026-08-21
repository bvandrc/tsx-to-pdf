import type { Page } from './get-browser.ts'

/** Which raster format to screenshot the page as. */
export type ImageFormat = 'png' | 'jpg'

/**
 * Screenshots an already-loaded page's `.page` element — the sheet itself,
 * however tall it grows — the same render the PDF is generated from. Goes
 * through `$` and the element handle it returns rather than a locator: both
 * drivers' element handles screenshot the same way, while Puppeteer's
 * locator does not expose one.
 */
export const buildImage = async (
  page: Page,
  format: ImageFormat
): Promise<Uint8Array> => {
  const element = await page.$('.page')

  if (!element) {
    throw new Error('No .page element found to screenshot.')
  }

  return element.screenshot({ type: format === 'jpg' ? 'jpeg' : 'png' })
}
