import { buildMarkdown } from '../build-markdown.ts'

/** A whole page, since that is what the converter is handed. */
const page = (body: string) =>
  `<!DOCTYPE html><html><head><title>Resume</title><style>.a{color:red}</style><script>window.x=1</script></head><body>${body}</body></html>`

describe('buildMarkdown', () => {
  it('drops the head, so its text does not open the document', async () => {
    const markdown = await buildMarkdown(page('<h1>Blake</h1>'))

    expect(markdown.trim()).toBe('# Blake')
  })

  it('keeps the structure Markdown can say', async () => {
    const markdown = await buildMarkdown(
      page(
        '<h2>Experience</h2><ul><li>Built <strong>things</strong></li><li><a href="https://example.com">A link</a></li></ul>'
      )
    )

    expect(markdown).toBe(
      [
        '## Experience',
        '',
        '- Built **things**',
        '- [A link](https://example.com)',
        '',
      ].join('\n')
    )
  })

  it('drops the classes that carry the layout', async () => {
    const markdown = await buildMarkdown(
      page('<div class="grid grid-cols-2 gap-4"><p>Left</p><p>Right</p></div>')
    )

    expect(markdown).toBe(['Left', '', 'Right', ''].join('\n'))
  })

  it('fences a code block rather than indenting it', async () => {
    const markdown = await buildMarkdown(page('<pre><code>npm i</code></pre>'))

    expect(markdown).toContain('```')
    expect(markdown).toContain('npm i')
  })

  it('normalises the markers Prettier has an opinion about', async () => {
    const markdown = await buildMarkdown(
      page('<ul><li><em>Emphasised</em></li></ul>')
    )

    // node-html-markdown emits `* ` and `*em*`; the Prettier pass rewrites both.
    expect(markdown.trim()).toBe('- _Emphasised_')
  })
})
