import { buildMarkdown } from '../build-markdown.ts'

describe('buildMarkdown', () => {
  it('converts the page to the document, and nothing from the head', async () => {
    // A whole page, since that is what the converter is handed.
    const markdown = await buildMarkdown(`<!DOCTYPE html>
<html>
  <head>
    <title>Resume</title>
    <style>.a{color:red}</style>
    <script>window.x=1</script>
  </head>
  <body>
    <h1>Blake</h1>
    <h2>Experience</h2>
    <ul>
      <li>Built <strong>things</strong></li>
      <li><a href="https://example.com">A link</a></li>
      <li><em>Emphasised</em></li>
    </ul>
    <pre><code>npm i</code></pre>
  </body>
</html>`)

    // Matching the whole document is what keeps the head out of it: the title,
    // the stylesheet, and the script would each land above the heading. It is
    // also what pins the markers — node-html-markdown emits `* ` and `*em*`,
    // and a fenced block only reads as one when it is not indented instead.
    expect(markdown).toBe(`# Blake

## Experience

- Built **things**
- [A link](https://example.com)
- _Emphasised_

\`\`\`
npm i
\`\`\`
`)
  })
})

describe('buildMarkdown with data-markdown', () => {
  it('keeps a run of NBSP as entities, but not in code', async () => {
    const markdown = await buildMarkdown(
      '<body><h2>A\u00A0\u00A0\u00A0B</h2><p><code>x\u00A0y</code></p></body>'
    )

    // Collapsed to one plain space, the heading would lose its spacing. A code
    // span would show the entity as typed, so it is left to the converter,
    // which gives a plain space there.
    expect(markdown).toBe('## A&nbsp;&nbsp;&nbsp;B\n\n`x y`\n')
  })

  it('keeps an `html` element whole, formatted, without the marker', async () => {
    const markdown = await buildMarkdown(
      '<body><h2>Skills</h2><table data-markdown="html"><tr><td colspan="2" align="center"><img src="a.svg?x=1&amp;y=2" width="40" data-markdown="html" />\u00A0<em>A</em></td></tr></table><p>After</p></body>'
    )

    // The nested marker goes too: it means nothing inside a kept element.
    expect(markdown).toBe(`## Skills

<table>
  <tr>
    <td colspan="2" align="center"><img src="a.svg?x=1&amp;y=2" width="40" />&nbsp;<em>A</em></td>
  </tr>
</table>

After
`)
  })

  it('keeps a block element on lines of its own, and an inline one inline', async () => {
    const markdown = await buildMarkdown(
      '<body><p data-markdown="html">One</p><p data-markdown="html">Two</p><p>Text <img src="a.svg" width="9" data-markdown="html" /> more</p></body>'
    )

    // Two blocks on one line would read as a single HTML block.
    expect(markdown).toBe(`<p>One</p>

<p>Two</p>

Text <img src="a.svg" width="9" /> more
`)
  })

  it('indents a kept block to the list item it sits in', async () => {
    const markdown = await buildMarkdown(
      '<body><ul><li><table data-markdown="html"><tr><td>A</td></tr></table></li></ul></body>'
    )

    expect(markdown).toBe(`- <table>
    <tr>
      <td>A</td>
    </tr>
  </table>
`)
  })

  it('refuses a value it does not know', async () => {
    await expect(
      buildMarkdown('<body><table data-markdown="raw"></table></body>')
    ).rejects.toThrow('<table data-markdown="raw"> is not one of html.')
  })
})
