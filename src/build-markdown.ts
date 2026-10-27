import { randomBytes } from 'node:crypto'
import { NodeHtmlMarkdown } from 'node-html-markdown'
import { HTMLElement, type Node, parse, TextNode } from 'node-html-parser'
import { format as prettify } from 'prettier'

/** Set on an element to change how it comes out in the Markdown. */
const MARKDOWN_ATTRIBUTE = 'data-markdown'

/**
 * What `data-markdown` can ask for:
 * - `html` — the element is written whole as HTML, for what Markdown has no way
 *   to say: alignment, image sizes, a table's spans
 */
const MARKDOWN_MODES = ['html'] as const

type MarkdownMode = (typeof MARKDOWN_MODES)[number]

// A Unicode noncharacter, reserved for exactly this kind of internal use, so
// no document carries one. node-html-markdown collapses whitespace with `\s`,
// which matches NBSP, so a run of them would otherwise come out as one space.
// https://github.com/crosstype/node-html-markdown/issues/87
const NBSP_PLACEHOLDER = '\uFDD0'

/** NBSP as a text node can carry it: the character itself, or any of its entity spellings. */
const NBSP = /\u00A0|&nbsp;|&#160;|&#xa0;/gi

/**
 * The tags that open an HTML block in CommonMark. A kept element with one of
 * these goes on lines of its own; any other stays inline, mid-paragraph.
 * https://spec.commonmark.org/0.31.2/#html-blocks
 */
const BLOCK_TAGS = new Set(
  `address article aside base basefont blockquote body caption center col
   colgroup dd details dialog dir div dl dt fieldset figcaption figure
   footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe
   legend li link main menu menuitem nav noframes ol optgroup option p
   param pre script search section style summary table tbody td textarea
   tfoot th thead title tr track ul`
    .toUpperCase()
    .split(/\s+/)
)

/**
 * Where Markdown prints text literally, so `&nbsp;` would show as typed.
 *
 * Upper case, as node-html-parser's `tagName` gives it, like the DOM's.
 */
const LITERAL_TEXT = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE', 'TEXTAREA'])

const isMarkdownMode = (value: string): value is MarkdownMode =>
  (MARKDOWN_MODES as readonly string[]).includes(value)

/** Swaps NBSP for the placeholder in every text node Markdown will not print literally. */
const protectNbsp = (node: Node): void => {
  if (node instanceof TextNode) {
    node.rawText = node.rawText.replaceAll(NBSP, NBSP_PLACEHOLDER)
  } else if (!(node instanceof HTMLElement && LITERAL_TEXT.has(node.tagName))) {
    node.childNodes.forEach(protectNbsp)
  }
}

/** Removes `data-markdown`, which means nothing to whoever reads the output. */
const dropMarker = (element: HTMLElement): void => {
  const attributes = Object.entries(element.rawAttributes)

  // Keeps the parser's attribute caches in step, but requotes the values left
  // and drops every backslash from them, so the source text is rebuilt below.
  element.removeAttribute(MARKDOWN_ATTRIBUTE)

  element.rawAttrs = attributes
    .filter(([name]) => name !== MARKDOWN_ATTRIBUTE)
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
 * element marked `data-markdown="html"` is the exception: it keeps its HTML,
 * whole, for Markdown read somewhere that renders it, like a GitHub README.
 */
export const buildMarkdown = async (html: string): Promise<string> => {
  const page = parse(html)
  protectNbsp(page)

  // Each kept element is swapped for a token while the rest converts, and put
  // back afterwards, so neither converter nor formatter touches its markup.
  // Random, so no text in the document can be mistaken for one.
  const marker = `tsxtopdf${randomBytes(4).toString('hex')}`
  const kept: Promise<string>[] = []
  const keep = (markup: string | Promise<string>) =>
    `${marker}k${kept.push(Promise.resolve(markup)) - 1}k`

  // Re-queried each time rather than collected up front: outermost first, and
  // whatever an `html` element swallows goes with it.
  for (
    let element = page.querySelector(`[${MARKDOWN_ATTRIBUTE}]`);
    element;
    element = page.querySelector(`[${MARKDOWN_ATTRIBUTE}]`)
  ) {
    const mode = element.getAttribute(MARKDOWN_ATTRIBUTE) ?? ''

    if (!isMarkdownMode(mode)) {
      throw new Error(
        `<${element.rawTagName} ${MARKDOWN_ATTRIBUTE}="${mode}"> is not one of ${MARKDOWN_MODES.join(', ')}.`
      )
    }

    const nested = element.querySelectorAll(`[${MARKDOWN_ATTRIBUTE}]`)
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
