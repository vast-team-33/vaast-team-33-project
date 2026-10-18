# Crossing Risk frontend

React + Vite + TypeScript + Tailwind CSS 4 + shadcn/ui (button, card, badge, tabs; hand-added, see `components.json`).
Import alias: `@/` maps to `src/`.

## Run

```bash
npm install --legacy-peer-deps   # (peer-dep conflict between vite and a plugin; flag is safe)
npm run dev                      # proxies /api and /media to http://127.0.0.1:8778 (SSH tunnel to the backend)
VITE_MOCK=1 npm run dev          # no backend: reads ../api/fixtures (JSON imported in src/api/mock.ts,
                                 # thumbnails served from ../api/fixtures/media by a dev-only Vite plugin)
npm run build                    # tsc -b && vite build -> dist/
npm run build:archive            # archived demo for GitHub Pages -> dist-archive/: VITE_ARCHIVE=1 answers from
                                 # static api/*.json (src/api/archive.ts) and copies ../archive in (build it first
                                 # with `python3 scripts/build_archive.py` from the repo root)
npm run types                    # regenerate src/api/types.ts from ../api/openapi.yaml
```

## Rules

- **Bundle budget: 800 KB** for `dist/` (the deploy limit is 1 MiB, and media/hero frames also count). Do not ship large
  images or heavy libraries. Mock fixtures are code-split and only loaded when `VITE_MOCK=1`.
- **All URLs are relative to the page** (the app is served under a sub-path, e.g. `/app`). Never use a leading slash.
  API calls go through `src/api/client.ts`, which uses `new URL('api/...', document.baseURI)`. Media URLs from the API
  (`thumb_url`, `clip_url`) are already relative; use them as-is. `base: './'` is set in `vite.config.ts`.
- `src/api/types.ts` is generated; do not edit it by hand.
