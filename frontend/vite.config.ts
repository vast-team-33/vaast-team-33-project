import path from 'node:path'
import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// Mock mode only: serve ../api/fixtures/media/* at /media/* in dev (no binaries copied).
function mockMedia(): Plugin {
  const root = path.resolve(import.meta.dirname, '../api/fixtures/media')
  return {
    name: 'mock-media',
    configureServer(server) {
      server.middlewares.use('/media', (req, res, next) => {
        const file = path.join(root, decodeURIComponent((req.url ?? '').split('?')[0]))
        if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
        res.setHeader('Content-Type', file.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const mock = process.env.VITE_MOCK === '1' || mode === 'mock'
  return {
    base: './',
    plugins: [react(), tailwindcss(), ...(mock ? [mockMedia()] : [])],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    server: {
      fs: { allow: ['..'] },
      proxy: mock
        ? undefined
        : {
            '/api': 'http://127.0.0.1:8778',
            '/media': 'http://127.0.0.1:8778',
          },
    },
  }
})
