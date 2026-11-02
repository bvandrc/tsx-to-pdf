import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const roots: string[] = []

afterAll(async () => {
  await Promise.all(
    roots.map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

/**
 * A real directory tree, removed after the test file that made it finishes.
 *
 * Keys are paths relative to the directory; a key ending in `/` is an empty
 * folder. Built inside this package's `node_modules` rather than the system
 * temp dir, so the packages a document imports (`preact`, and Tailwind for
 * `@import "tailwindcss"`) resolve from it the way they do in a consumer's
 * project.
 */
export const createDirTree = async (files: Record<string, string>) => {
  const dir = await mkdtemp(
    join(import.meta.dirname, '../../../node_modules/.tsx-to-pdf-test-')
  )
  roots.push(dir)

  for (const [path, contents] of Object.entries(files)) {
    const full = join(dir, path)
    if (path.endsWith('/')) {
      await mkdir(full, { recursive: true })
      continue
    }
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, contents)
  }

  return dir
}
