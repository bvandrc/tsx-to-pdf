import { randomBytes } from 'node:crypto'
import { htmlBlockNames, htmlRawNames } from 'micromark-util-html-tag-name'
import { NodeHtmlMarkdown } from 'node-html-markdown'
import { HTMLElement, type Node, parse, TextNode } from 'node-html-parser'
import { format as prettify } from 'prettier'

/**
 * Set on an element to write it whole as HTML, for what Markdown has no way to
 * say: alignment, image sizes, a table's spans.
 */
const KEEP_HTML_ATTRIBUTE = 'data-keep-html'

// A Unicode noncharacter, reserved for exactly this kind of internal use, so
// no document carries one. node-html-markdown collapses whitespace with `\s`,
// which matches NBSP, so a run of them would otherwise come out as one space.
const NBSP_PLACEHOLDER = '\uFDD0'

/** NBSP as a text node can carry it: the character itself, or any of its entity spellings. */
const NBSP = /\u00A0|&nbsp;|&#160;|&#xa0;/gi

/**
 * The tags that start an HTML block in CommonMark, the Markdown spec GitHub's
 * builds on: a line opening with one is passed through as raw HTML up to the
 * next blank line, where any other tag is inline HTML within a paragraph.
 *
 * So a kept element with one of these goes on lines of its own, and any other
 * stays inline, mid-paragraph.
 * https://spec.commonmark.org/0.31.2/#html-blocks
 */
const BLOCK_TAGS = new Set(
  // Upper case, as node-html-parser's `tagName` gives it.
  [...htmlBlockNames, ...htmlRawNames].map((name) => name.toUpperCase())
)

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

/** Removes `data-keep-html`, which means nothing to whoever reads the output. */
const dropMarker = (element: HTMLElement): void => {
  const attributes = Object.entries(element.rawAttributes)

  // Keeps the parser's attribute caches in step, but requotes the values left
  // and drops every backslash from them, so the source text is rebuilt below.
  element.removeAttribute(KEEP_HTML_ATTRIBUTE)

  element.rawAttrs = attributes
    .filter(([name]) => name !== KEEP_HTML_ATTRIBUTE)
    // A bare attribute (`disabled`) parses with a null value.
    .map(([name, value]) =>
      value == null ? name : `${name}="${value.replaceAll('"', '&quot;')}"`
    )
    .join(' ')
}

/**
 * The page's text as Markdown: headings, lists, links, emphasis, and nothing
 * else.
 *
 * Layout lives in classes here — columns, alignment, spacing — and none of it
 * survives, so this is what the document says rather than how it looks. An
 * element marked `data-keep-html` is the exception: it keeps its HTML,
 * whole, for Markdown read somewhere that renders it, like a GitHub README.
 */
export const buildMarkdown = async (html: string): Promise<string> => {
  const page = parse(html)
  // https://github.com/crosstype/node-html-markdown/issues/87
  protectNbsp(page)

  // Each kept element is swapped for a token while the rest converts, and put
  // back afterwards, so neither converter nor formatter touches its markup.
  // Random, so no text in the document can be mistaken for one.
  const marker = `tsxtopdf${randomBytes(4).toString('hex')}`
  const kept: Promise<string>[] = []
  const keep = (markup: string | Promise<string>) =>
    `${marker}k${kept.push(Promise.resolve(markup)) - 1}k`

  // Preact writes `data-keep-html={false}` out as `"false"` rather than leaving
  // the attribute off, so that value reads as unmarked.
  page.querySelectorAll(`[${KEEP_HTML_ATTRIBUTE}="false"]`).forEach(dropMarker)

  // Re-queried each time rather than collected up front: outermost first, and
  // whatever a kept element swallows goes with it.
  for (
    let element = page.querySelector(`[${KEEP_HTML_ATTRIBUTE}]`);
    element;
    element = page.querySelector(`[${KEEP_HTML_ATTRIBUTE}]`)
  ) {
    const nested = element.querySelectorAll(`[${KEEP_HTML_ATTRIBUTE}]`)
    dropMarker(element)

    // Nested markers mean nothing once the whole element is kept.
    nested.forEach(dropMarker)

    const token = keep(
      // On its own, so it starts at the margin: indented four spaces, an
      // HTML block reads as code. Unbounded width breaks lines between
      // blocks only, the way Markdown prose is left unwrapped, rather than
      // splitting inline runs inside their tags.
      prettify(element.toString(), {
        parser: 'html',
        printWidth: Number.POSITIVE_INFINITY,
      }).then((markup) => markup.trimEnd())
    )

    // A paragraph of its own gives a block the blank lines that separate it
    // from whatever is next, a kept sibling included.
    element.replaceWith(
      BLOCK_TAGS.has(element.tagName) ? `<p>${token}</p>` : token
    )
  }

  const markdown = NodeHtmlMarkdown.translate(page.toString(), {
    codeBlockStyle: 'fenced',
    // Chrome rather than content: the page is a whole document, `<head>` and
    // all. Dropped by name, because a fragment parser keeps the text of the
    // elements it does not recognise as belonging to the head.
    ignore: ['head', 'title', 'style', 'script'],
  })

  const [formatted, blocks] = await Promise.all([
    // Prettier as with the HTML, so the output is normalised the same way
    // rather than however the converter happened to indent it.
    prettify(markdown, { parser: 'markdown' }),
    // Awaited together, so a block that fails to format rejects this call
    // rather than going unhandled while the Markdown is formatted.
    Promise.all(kept),
  ])

  return (
    formatted
      .replaceAll(
        new RegExp(`${marker}k(\\d+)k`, 'g'),
        (_, index: string, offset: number, whole: string) => {
          // A block nested in a list or a quote continues at the same depth.
          const lead = whole.slice(whole.lastIndexOf('\n', offset) + 1, offset)
          const indent = lead.replaceAll(/[^>\s]/g, ' ')

          return (blocks[Number(index)] ?? '').replaceAll('\n', `\n${indent}`)
        }
      )
      // An entity rather than the character, so the spacing is visible in the
      // source and survives anything that normalises whitespace.
      .replaceAll(NBSP_PLACEHOLDER, '&nbsp;')
  )
}
