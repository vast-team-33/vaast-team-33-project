// Archive build only: copy the static snapshot (../archive, built by scripts/build_archive.py) into
// dist-archive/, so the page finds api/*.json and media/* next to index.html, like the live backend serves them.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../../archive')
const out = resolve(here, '../dist-archive')
if (!existsSync(resolve(src, 'api/archive.json'))) {
  console.error('No archive at ../archive. Run `python3 scripts/build_archive.py` from the repo root first.')
  process.exit(1)
}
for (const dir of ['api', 'media']) {
  rmSync(resolve(out, dir), { recursive: true, force: true })
  cpSync(resolve(src, dir), resolve(out, dir), { recursive: true })
}
console.log(`copied ${src} -> ${out}`)
