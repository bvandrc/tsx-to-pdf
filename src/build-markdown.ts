import { NodeHtmlMarkdown } from 'node-html-markdown'
import { format as prettify } from 'prettier'

// A Unicode noncharacter, reserved for exactly this kind of internal use, so
// no document carries one. node-html-markdown collapses whitespace with `\s`,
// which matches NBSP, so a run of them would otherwise come out as one space.
const NBSP_PLACEHOLDER = '\uFDD0'

/** NBSP as the page can carry it: the character itself, or any of its entity spellings. */
const NBSP = /\u00A0|&nbsp;|&#160;|&#xa0;/gi

/**
 * The page's text as Markdown: headings, lists, links, emphasis, and nothing
 * else.
 *
 * Layout lives in classes here — columns, alignment, spacing — and none of it
 * survives, so this is what the document says rather than how it looks.
 */
export const buildMarkdown = async (html: string): Promise<string> => {
  const markdown = NodeHtmlMarkdown.translate(
    // https://github.com/crosstype/node-html-markdown/issues/87
    html.replaceAll(NBSP, NBSP_PLACEHOLDER),
    {
      codeBlockStyle: 'fenced',
      // Chrome rather than content: the page is a whole document, `<head>` and
      // all. Dropped by name, because a fragment parser keeps the text of the
      // elements it does not recognise as belonging to the head.
      ignore: ['head', 'title', 'style', 'script'],
    }
  )

  // Prettier as with the HTML, so the output is normalised the same way rather
  // than however the converter happened to indent it.
  const formatted = await prettify(markdown, { parser: 'markdown' })

  // An entity rather than the character, so the spacing is visible in the
  // source and survives anything that normalises whitespace.
  return formatted.replaceAll(NBSP_PLACEHOLDER, '&nbsp;')
}
