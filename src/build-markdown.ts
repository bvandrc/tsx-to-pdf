import { format as prettify } from 'prettier'
import type TurndownService from 'turndown'

/** Chrome rather than content: the page is a whole document, `<head>` and all. */
const NON_CONTENT = ['head', 'title', 'style', 'script'] as const

/**
 * Loaded on demand, so a build without `markdown` needs none of it. Turndown
 * carries a full DOM implementation to parse with — 9 MB installed, for an
 * output that is off by default.
 */
const turndown = async (): Promise<typeof TurndownService> => {
  try {
    return (await import('turndown')).default
  } catch (error) {
    throw new Error(
      'Markdown output needs Turndown, which is yours to install:\n' +
        '  pnpm add -D turndown\n' +
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
  const Turndown = await turndown()

  // Only the two Prettier does not settle for us: it rewrites bullet markers and
  // emphasis to its own either way, but leaves headings and code blocks as it
  // finds them, and setext headings cannot express anything below an `h2`.
  const service = new Turndown({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  })

  // Dropped by name, because a fragment parser keeps the text of the elements it
  // does not recognise as belonging to the head.
  service.remove([...NON_CONTENT])

  // Prettier as with the HTML, so the output is normalised the same way rather
  // than however Turndown happened to indent it.
  return prettify(service.turndown(html), { parser: 'markdown' })
}
