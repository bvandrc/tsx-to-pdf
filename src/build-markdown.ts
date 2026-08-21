import { NodeHtmlMarkdown } from 'node-html-markdown'
import { format as prettify } from 'prettier'

/**
 * The page's text as Markdown: headings, lists, links, emphasis, and nothing
 * else. Layout lives in classes here — columns, alignment, spacing — and none of
 * it survives, so this is what the document says rather than how it looks.
 */
export const buildMarkdown = (html: string): Promise<string> => {
  const markdown = NodeHtmlMarkdown.translate(html, {
    codeBlockStyle: 'fenced',
    // Chrome rather than content: the page is a whole document, `<head>` and
    // all. Dropped by name, because a fragment parser keeps the text of the
    // elements it does not recognise as belonging to the head.
    ignore: ['head', 'title', 'style', 'script'],
  })

  // Prettier as with the HTML, so the output is normalised the same way rather
  // than however the converter happened to indent it.
  return prettify(markdown, { parser: 'markdown' })
}
