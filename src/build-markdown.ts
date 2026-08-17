import { format as prettify } from 'prettier'
import TurndownService from 'turndown'

/** Chrome rather than content: the page is a whole document, `<head>` and all. */
const NON_CONTENT = ['head', 'title', 'style', 'script'] as const

/**
 * The page's text as Markdown: headings, lists, links, emphasis, and nothing
 * else. Layout lives in classes here — columns, alignment, spacing — and none of
 * it survives, so this is what the document says rather than how it looks.
 */
export const buildMarkdown = (html: string): Promise<string> => {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
  })

  // Dropped by name, because a fragment parser keeps the text of the elements it
  // does not recognise as belonging to the head.
  turndown.remove([...NON_CONTENT])

  // Prettier as with the HTML, so the output is normalised the same way rather
  // than however Turndown happened to indent it.
  return prettify(turndown.turndown(html), { parser: 'markdown' })
}
