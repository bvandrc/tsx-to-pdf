import { NodeHtmlMarkdown } from 'node-html-markdown'
import { HTMLElement, type Node, parse, TextNode } from 'node-html-parser'
import { format as prettify } from 'prettier'

// A Unicode noncharacter, reserved for exactly this kind of internal use, so
// no document carries one. node-html-markdown collapses whitespace with `\s`,
// which matches NBSP, so a run of them would otherwise come out as one space.
const NBSP_PLACEHOLDER = '\uFDD0'

/** NBSP as a text node can carry it: the character itself, or any of its entity spellings. */
const NBSP = /\u00A0|&nbsp;|&#160;|&#xa0;/gi

/**
 * Where Markdown prints text literally, so `&nbsp;` would show as typed.
 *
 * Upper case, as node-html-parser's `tagName` gives it, like the DOM's.
 */
const LITERAL_TEXT = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE', 'TEXTAREA'])

/** Swaps NBSP for the placeholder in every text node Markdown will not print literally. */
const protectNbsp = (node: Node): void => {
  if (node instanceof TextNode) {
    node.rawText = node.rawText.replaceAll(NBSP, NBSP_PLACEHOLDER)
  } else if (!(node instanceof HTMLElement && LITERAL_TEXT.has(node.tagName))) {
    node.childNodes.forEach(protectNbsp)
  }
}

/**
 * The page's text as Markdown: headings, lists, links, emphasis, and nothing
 * else.
 *
 * Layout lives in classes here — columns, alignment, spacing — and none of it
 * survives, so this is what the document says rather than how it looks.
 */
export const buildMarkdown = async (html: string): Promise<string> => {
  const page = parse(html)
  // https://github.com/crosstype/node-html-markdown/issues/87
  protectNbsp(page)

  const markdown = NodeHtmlMarkdown.translate(page.toString(), {
    codeBlockStyle: 'fenced',
    // Chrome rather than content: the page is a whole document, `<head>` and
    // all. Dropped by name, because a fragment parser keeps the text of the
    // elements it does not recognise as belonging to the head.
    ignore: ['head', 'title', 'style', 'script'],
  })

  // Prettier as with the HTML, so the output is normalised the same way rather
  // than however the converter happened to indent it.
  const formatted = await prettify(markdown, { parser: 'markdown' })

  // An entity rather than the character, so the spacing is visible in the
  // source and survives anything that normalises whitespace.
  return formatted.replaceAll(NBSP_PLACEHOLDER, '&nbsp;')
}
