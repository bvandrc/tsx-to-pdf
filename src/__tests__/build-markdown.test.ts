import { buildMarkdown } from '../build-markdown.ts'

/** A whole page, since that is what the converter is handed. */
const page = (body: string) => `<!DOCTYPE html>
<html>
  <head>
    <title>Resume</title>
    <style>.a{color:red}</style>
    <script>window.x=1</script>
  </head>
  <body>${body}</body>
</html>`

describe('buildMarkdown', () => {
  it('converts the page to the document, and nothing from the head', async () => {
    const markdown = await buildMarkdown(
      page(`
        <h1>Blake</h1>
        <h2>Experience</h2>
        <ul>
          <li>Built <strong>things</strong></li>
          <li><a href="https://example.com">A link</a></li>
          <li><em>Emphasised</em></li>
        </ul>
        <pre><code>npm i</code></pre>
      `)
    )

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
