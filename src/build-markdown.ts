import type { NodeHtmlMarkdown as NodeHtmlMarkdownType } from 'node-html-markdown'
import { format as prettify } from 'prettier'

/** Chrome rather than content: the page is a whole document, `<head>` and all. */
const NON_CONTENT = ['head', 'title', 'style', 'script'] as const

/**
 * Loaded on demand, so a build without `markdown` needs none of it.
 */
const nodeHtmlMarkdown = async (): Promise<typeof NodeHtmlMarkdownType> => {
  try {
    return (await import('node-html-markdown')).NodeHtmlMarkdown
  } catch (error) {
    throw new Error(
      'Markdown output needs node-html-markdown, which is yours to install:\n' +
        '  pnpm add -D node-html-markdown\n' +
        'Or drop `markdown` from your config.',
      { cause: error }
    )
  }
}

/**
 * The page's text as Markdown: headings, lists, links, emphasis, and nothing
 * else. Layout lives in classes here — columns, alignment, spacing — and none of
 * it survives, so this is what the document says rather than how it looks.
 */
export const buildMarkdown = async (html: string): Promise<string> => {
  const NodeHtmlMarkdown = await nodeHtmlMarkdown()

  const markdown = NodeHtmlMarkdown.translate(html, {
    codeBlockStyle: 'fenced',
    // Dropped by name, because a fragment parser keeps the text of the elements
    // it does not recognise as belonging to the head.
    ignore: [...NON_CONTENT],
  })

  // Prettier as with the HTML, so the output is normalised the same way rather
  // than however the converter happened to indent it.
  return prettify(markdown, { parser: 'markdown' })
}
