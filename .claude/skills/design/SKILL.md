---
name: design
description: Use before building or restyling any UI in frontend/ (pages, cards, badges, charts, video overlay, export panel) for the Crossing Risk app. Defines the visual language, colour tokens, components and copy tone so every screen looks the same.
---

# Crossing Risk design language

Stack: React + Vite + Tailwind CSS 4 + shadcn/ui. Screens and data are in `docs/frontend.md` and
`docs/api-contract.md`. Follow this file for how things look.

## Direction

- Serious automotive-safety, mission-control feel. Calm, dense, precise. No playful gradients, no emoji, no illustrations.
- **Dark theme is the default** (`<html class="dark">`). A light theme must also work: same tokens, flipped.
- Colour is for meaning only (danger, speed lines, demo). Everything else is neutral blue-grey.
- Numbers are the hero: danger score, speeds, counts. Make them big, mono, tabular.

## Tokens (put in `frontend/src/index.css`)

shadcn/ui variable names, Tailwind 4 `@theme inline` mapping. Values are oklch.

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(0.985 0.003 250);  --foreground: oklch(0.2 0.02 255);
  --card: oklch(1 0 0);                  --card-foreground: oklch(0.2 0.02 255);
  --popover: oklch(1 0 0);               --popover-foreground: oklch(0.2 0.02 255);
  --primary: oklch(0.45 0.15 255);       --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.95 0.008 250);    --secondary-foreground: oklch(0.25 0.02 255);
  --muted: oklch(0.95 0.008 250);        --muted-foreground: oklch(0.48 0.02 255);
  --accent: oklch(0.93 0.015 250);       --accent-foreground: oklch(0.2 0.02 255);
  --destructive: oklch(0.55 0.22 27);
  --border: oklch(0.9 0.01 250);  --input: oklch(0.9 0.01 250);  --ring: oklch(0.55 0.15 255);
  --radius: 0.5rem;
  /* semantic */
  --danger-high: oklch(0.55 0.22 27);      /* score >= 60 */
  --danger-mid:  oklch(0.7 0.16 70);       /* score >= 30 */
  --danger-low:  oklch(0.58 0.15 150);     /* else */
  --speed-measured: oklch(0.55 0.19 255);  /* blue, solid */
  --speed-suggested: oklch(0.75 0.16 90);  /* yellow, dashed */
  --demo: oklch(0.6 0.2 310);              /* violet "demo" badge */
}
.dark {
  --background: oklch(0.15 0.015 255);   --foreground: oklch(0.96 0.005 250);
  --card: oklch(0.2 0.02 255);           --card-foreground: oklch(0.96 0.005 250);
  --popover: oklch(0.2 0.02 255);        --popover-foreground: oklch(0.96 0.005 250);
  --primary: oklch(0.72 0.14 250);       --primary-foreground: oklch(0.15 0.015 255);
  --secondary: oklch(0.26 0.02 255);     --secondary-foreground: oklch(0.96 0.005 250);
  --muted: oklch(0.26 0.02 255);         --muted-foreground: oklch(0.7 0.02 250);
  --accent: oklch(0.3 0.03 255);         --accent-foreground: oklch(0.96 0.005 250);
  --destructive: oklch(0.65 0.22 25);
  --border: oklch(1 0 0 / 11%);  --input: oklch(1 0 0 / 15%);  --ring: oklch(0.65 0.14 250);
  --danger-high: oklch(0.65 0.23 25);
  --danger-mid:  oklch(0.8 0.16 75);
  --danger-low:  oklch(0.72 0.17 150);
  --speed-measured: oklch(0.7 0.16 250);
  --speed-suggested: oklch(0.87 0.17 95);
  --demo: oklch(0.74 0.18 310);
}
@theme inline {
  --color-background: var(--background);  --color-foreground: var(--foreground);
  --color-card: var(--card);              --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);        --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);    --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);          --color-destructive: var(--destructive);
  --color-border: var(--border);          --color-input: var(--input);  --color-ring: var(--ring);
  --color-danger-high: var(--danger-high); --color-danger-mid: var(--danger-mid);
  --color-danger-low: var(--danger-low);
  --color-speed-measured: var(--speed-measured); --color-speed-suggested: var(--speed-suggested);
  --color-demo: var(--demo);
  --radius-sm: calc(var(--radius) - 2px); --radius-md: var(--radius); --radius-lg: calc(var(--radius) + 2px);
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
```

Danger band helper (one place only, e.g. `lib/danger.ts`): `>=60 -> high`, `>=30 -> mid`, else `low`.
Use `bg-danger-high/15 text-danger-high border-danger-high/40` for badges. Never use a band colour for anything else.
Never rely on colour alone: also show the number and a word (High / Medium / Low).

## Type, space, shape

| Thing | Rule |
|---|---|
| Font | System stack only (no font files). Optional: Inter variable subset, one file, under 50 KB. |
| Page title | `text-2xl font-semibold tracking-tight` |
| Section title | `text-lg font-medium` |
| Body | `text-sm` (14 px), `text-muted-foreground` for secondary |
| Labels / badges | `text-xs font-medium uppercase tracking-wide` |
| Numbers | `font-mono tabular-nums`; score `text-3xl font-semibold` |
| Spacing | 4 px base. Card padding `p-4`, gaps `gap-3`/`gap-4`, page sections `space-y-6`, page max width `max-w-7xl`, side gutter `px-4 md:px-6` |
| Radius | `rounded-lg` cards, `rounded-md` buttons and inputs, `rounded-full` badges |
| Shadow | Almost none. Borders carry the structure (`border border-border`). Only popovers get `shadow-lg`. |

## Components

- **Event card:** thumbnail (`thumb_url`, 16:9, `object-cover`) on top; score badge top-left over the image; below it badges row, drive id in mono, speed sparkline. Hover: `border-primary/50`. Whole card is one link.
- **Danger score badge:** the number (mono, bold) plus band word, in the band colours. Large variant on event detail with a thin band-coloured ring.
- **Position / crossing / agreement badges:** outline badges, neutral by default. Only `outside_crosswalk` and `on_road` use the danger-high tint, and `driver_less_careful` uses danger-mid. `marked_crosswalk` and `on_crosswalk` stay neutral. Labels in plain words ("Outside crosswalk", "Driver less careful").
- **Speed sparkline:** hand-rolled `<svg viewBox="0 0 100 24" preserveAspectRatio="none">`, two `<polyline>`s, `vector-effect: non-scaling-stroke`. No axes, no labels.
- **Speed chart:** hand-rolled SVG. Measured = solid line `stroke-speed-measured`, 2 px. Suggested = dashed `stroke-dasharray="6 4"` `stroke-speed-suggested`, 2 px. Light grid lines `stroke-border`. Legend underneath with a line swatch for each. Say "relative speed", never km/h. Show a playhead synced with the video.
- **Video player:** native `<video controls>` in a `rounded-lg` black frame, 16:9. Overlay is an absolutely placed SVG with `viewBox="0 0 1920 1080"` (the API frame size), so coordinates need no scaling. Lane polygon: fill `white/8%`, stroke `white/60%`, 2 px. Boxes: 2 px stroke in `white/70%`. The in-lane person: stroke `danger-high`, 3 px, with a small score tag. A "Show overlay" switch toggles it.
- **Feedback buttons:** four buttons in one row (wrap on mobile): "Driver was right", "Model was right", "Both fine", "False alarm". Outline style; the chosen one turns `primary`. After click show "Saved" for 2 s. Disable while posting.
- **Scenario / export panel:** a card with a persistent `demo` badge and the exact line **"Demo — no simulator connected"** at the top. Scenario summary, actors, variation chips, generation prompt in a mono block. Target picker + "Send to simulator" button; show the returned `message` in a violet-tinted box. "Download scenario JSON" is a normal button (it is real, no demo label).
- **Detector cards:** card per detector, built-in first with a "Built-in" badge. Name, prompt in plain words (2-line clamp), status badge (draft / ready / running). A dashed-border "New detector" card with a plus icon is last.
- **Progress bar:** `h-2 rounded-full bg-muted` with a `bg-primary` fill, plus "12 of 50 clips" in mono on the right. No animation beyond a width transition.
- **Demo badge:** `border-demo/40 bg-demo/15 text-demo`, text "demo". Put it on everything that is simulated or sample data.

## Background imagery

- Only our own dashcam frames: `api/fixtures/media/hero/dashcam_{1,2,3}.jpg` (bright daytime Toronto with a deep blue sky, so they need heavy darkening).
- Hero recipe: image as `bg-cover bg-center`, plus overlay `bg-gradient-to-b from-background/70 via-background/85 to-background`, optionally `blur-sm scale-105` on the image. Text must stay at least 4.5:1 contrast.
- Ship at most one frame in the bundle (about 200 KB). No stock or internet images, no icon packs beyond a few `lucide-react` icons imported by name.

## Copy

- Plain words, short labels: "Danger", "Driver", "Model", "Who was right?", "Crossing".
- Anything not real says **demo**: export, simulator targets, sample numbers. Never write "sent", "generated" or "running in simulator". Use "Demo: sending is simulated".
- Speeds have no unit. Scores are 0-100 integers. Times in 24 h.
- Empty and error states say what happened and what to do, in one line.

## Bundle limits

Deployed bundle must stay under about 800 KB (ConfigMap limit about 1 MiB).
- Add only the shadcn components you use (`npx shadcn add badge card button switch`...).
- No chart libraries: hand-rolled SVG. No moment/lodash. No web-font files over 50 KB.
- Check the `dist/` size after `npm run build`.

## Checklist before you finish a screen

- [ ] Uses only token classes (`bg-card`, `text-muted-foreground`, `text-danger-high`), no raw hex.
- [ ] Looks right in dark and light.
- [ ] Danger band colour only on score and risk badges, with the number visible.
- [ ] Measured = blue solid, suggested = yellow dashed, legend present.
- [ ] Every simulated thing carries a "demo" badge.
- [ ] Works at 375 px width, no horizontal scroll.
- [ ] Relative URLs only, bundle still under 800 KB.

## Do / Don't

| Do | Don't |
|---|---|
| Borders and spacing for structure | Heavy shadows, glass blur on cards |
| Mono tabular numbers | Proportional numbers in tables |
| Darken hero frames strongly | Put text straight on a bright frame |
| Hand-rolled SVG charts | recharts, chart.js, d3 |
| Say "demo" | Imply a simulator ran |
| Red only for real danger | Red for ordinary buttons or decoration |
