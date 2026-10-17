// Copy the whole-idea diagram from docs/ into public/ so the app serves it as idea.html.
// docs/crossing-risk-idea.html stays the single source; public/idea.html is generated (git-ignored).
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(resolve(here, '../public'), { recursive: true })
copyFileSync(resolve(here, '../../docs/crossing-risk-idea.html'), resolve(here, '../public/idea.html'))
