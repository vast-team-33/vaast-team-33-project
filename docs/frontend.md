# Frontend plan

Stack: **React + Vite + TypeScript + Tailwind CSS 4 + shadcn/ui.** The backend contract is in
[`api-contract.md`](api-contract.md); fixtures in `../api/fixtures/`.

## The story the UI must sell

We detect dangerous pedestrian moments in real driving footage and **package each one as a
simulator-ready scenario**. A simulator, such as NVIDIA Cosmos Transfer for video variations or
Omniverse and OpenSCENARIO tools for 3D re-simulation, turns one real moment into many synthetic
variants (night, rain, a child, a faster car). Training on those variants makes the driving model
better. The driver-versus-model comparison and the human "who was right?" labels decide which
moments are worth sending. That closes a **self-improvement loop**:

```
real dashcam → detect → score danger → driver vs model → human label → scenario package
     ↑                                                                      │
     └──────── better driving model ← train ← synthetic variants ← simulator ┘
```

**Only the left half is built.** The UI shows the full loop as the selling point. Anything past
"scenario package" is labelled as demo or roadmap. Never imply that a simulator ran.

## Screens

1. **Overview / hero:** the loop above as a diagram, plus headline numbers from `api/summary`
   (clips scanned, candidates, events, driver-less-careful count, labels collected).
2. **Events list:** cards or a table sorted by danger. Thumbnail, danger score (colour by band:
   ≥ 60 red, ≥ 30 amber, else green), position and crossing badges, driver-vs-model agreement,
   a small speed sparkline. Filters for agreement, crossing, position, drive and minimum danger.
3. **Event detail:**
   - The clip with an overlay drawn from `api/events/{id}/detections`: lane polygon, boxes,
     the in-lane person highlighted.
   - The speed chart: measured (solid) against suggested (dashed).
   - The score breakdown from `factors` and `api/config`.
   - The judge's reason.
   - The feedback buttons.
4. **Scenario export (the selling point):**
   - Shows the scenario package from `api/events/{id}/scenario`: summary, actors, ego speed
     profile, suggested variations as chips, generation prompt.
   - Offers a "Send to simulator" target picker. It calls `POST api/events/{id}/export`, then
     shows the returned `message`, which says it's a demo.
   - Also offers a "Download scenario JSON" button, which is real.
5. **Training queue:** events with labels, grouped by choice. This is the data for the next model round.
6. **Detectors: "add your own detection".** A card per detector, with the built-in one first, and a
   "New detector" card:
   - **Write the prompt.** Fields for name, the prompt in plain words, and an optional
     pre-filter (object class, in lane).
   - **Test on one sample.** Pick a clip or let the backend pick, call `preview`, and show the
     verdict, confidence and reason next to the clip in about 6 s.
   - **Run on the whole set.** Start a run, show a progress bar from polling `api/runs/{id}`,
     and list the matches as they come in.
   - **Send to the simulator.** Export the detector's events (demo), the same as for a single event.

## Look

- **Backgrounds:** use frames from our own dashcam footage, not stock photos from the internet.
  Three clean frames with no boxes are in `api/fixtures/media/hero/` (1600 px wide, 160–240 KB each).
  For a hero, darken or blur them so text stays readable.
- **Bundle size:** together the three frames take a third of the 1 MiB deploy limit. Ship one in the
  bundle, or let the backend serve them under `media/hero/` (see Build and deploy constraints).

## Build and deploy constraints

- **Relative URLs everywhere** (`api/...`, media URLs from the API). Vite `base: './'`.
  The app lives under `/app/` in production.
- The lab VM has **no Node**, so build on a laptop and commit nothing from `node_modules`.
- Deployment serves the built `dist/` as static files from our Python backend pod. Our code reaches
  the pod through a Kubernetes ConfigMap limited to about **1 MiB**, so keep the built bundle under
  roughly 800 KB:
  - add only the shadcn components you use,
  - avoid heavy chart libraries (an SVG sparkline or `recharts` is fine),
  - no large images or fonts.
- Local development: run Vite with a proxy for `api` and `media` to the backend over an SSH tunnel
  (`ssh -N -L 8778:127.0.0.1:8766 bc-<you>`), or mock with the fixtures (for example, MSW).
- Judges open https://workshop.thecosmoslabs.com → **App**.

## Still to do

- [ ] Backend: detectors, preview, runs and export endpoints (contract is ready, none implemented yet).
- [x] **Design skill:** done, see [`.claude/skills/design/SKILL.md`](../.claude/skills/design/SKILL.md).
- [ ] Scaffold the Vite + React + Tailwind 4 + shadcn app in `frontend/`.
- [ ] Backend serves the contract (currently the older experiment shape).
