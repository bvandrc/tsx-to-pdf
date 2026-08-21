import type { Page } from 'playwright'

/** Which raster format to screenshot the page as. */
export type ImageFormat = 'png' | 'jpg'

/**
 * Screenshots an already-loaded page's `.page` element — the sheet itself,
 * however tall it grows — the same render the PDF is generated from.
 */
export const buildImage = (
  page: Page,
  format: ImageFormat
): Promise<Uint8Array> =>
  page.locator('.page').screenshot({
    type: format === 'jpg' ? 'jpeg' : 'png',
  })
