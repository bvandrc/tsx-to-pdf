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
  it('keeps the structure Markdown can say, and nothing from the head', async () => {
    const markdown = await buildMarkdown(
      page(`
        <h1>Blake</h1>
        <h2>Experience</h2>
        <ul>
          <li>Built <strong>things</strong></li>
          <li><a href="https://example.com">A link</a></li>
        </ul>
      `)
    )

    // Matching the whole document is what keeps the head out of it: the title,
    // the stylesheet, and the script would each land above the heading.
    expect(markdown).toBe(`# Blake

## Experience

- Built **things**
- [A link](https://example.com)
`)
  })

  it('fences a code block rather than indenting it', async () => {
    const markdown = await buildMarkdown(page('<pre><code>npm i</code></pre>'))

    expect(markdown).toBe(`\`\`\`
npm i
\`\`\`
`)
  })

  it('normalises the markers Prettier has an opinion about', async () => {
    const markdown = await buildMarkdown(
      page('<ul><li><em>Emphasised</em></li></ul>')
    )

    // node-html-markdown emits `* ` and `*em*`; the Prettier pass rewrites both.
    expect(markdown.trim()).toBe('- _Emphasised_')
  })
})
