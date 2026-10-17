# DriveLoop: a self-training data engine for self-driving cars

Self-driving fleets record petabytes of camera video. DriveLoop keeps it on reliable VAST storage, finds the moments that matter with NVIDIA models, lets people check them, and turns each one into simulated training data for the next model. The built-in scenario today is pedestrians stepping into the road (formerly called Crossing Risk).

Team 33 · VAST Builders Challenge, London · 17 October 2026

Crossing at a marked crosswalk is expected; stepping onto the road outside one, in front of a
moving car, is a potentially dangerous situation. This project finds those moments in dashcam
footage, scores how dangerous each one is, and compares **what the driver actually did** with
**what our model says the car should have done**. Every disagreement becomes a labelled example
for a later self-training and self-improvement loop.

**The bigger idea:** each dangerous moment is packaged as a simulator-ready scenario and sent to a
simulation system (for example NVIDIA Cosmos Transfer or Omniverse), which generates many synthetic
variants (night, rain, a child, a faster car) to train self-driving models on. Users can also write
their own detectors in plain words, test one on a single clip, then run it over the whole archive.
We build the detection, scoring and scenario packaging; the simulator hand-off is shown as a demo.

> **Status:** an experiment is live at https://workshop.thecosmoslabs.com → **App**.
> The code is not in this repo yet. This first commit holds the agent instructions, the lab
> notes and the platform test results.

## How it works (experiment v2)

```
Toronto dashcam (1,080 clips × 5 s, already indexed by the platform)
  │
  ├─ 1. Candidates: stored per-frame YOLO boxes → a person whose feet are inside the
  │     lane-shaped zone ahead of the car for at least 1/3 s          (no GPU, ~20 s)
  ├─ 2. What the driver did: optical flow on the clip → relative speed curve
  │     → kept speed / slowed down / stopped / was stopped            (CPU)
  ├─ 3. What the model sees and suggests: Cosmos3-Reason watches the clip →
  │     on road / crosswalk / sidewalk, risk, recommended action      (~5 s per clip, shared GPU)
  ├─ 4. Danger score 0–100 = closeness × time in the lane × location × car moving
  ├─ 5. Agreement: driver as careful / more careful / less careful than the model
  └─ 6. Web page: clip, score, driver-vs-model speed chart, "who was right?" feedback buttons
```

First results (24 closest pedestrians out of 558 candidates): the crosswalk verdicts look right;
the main error is people standing on the right-hand sidewalk of narrow streets being counted as
"on road". The next step is a sharper on-road check (Nemotron vision model on the peak frame).

## Platform

What the organisers provide and what we measured is in
[`docs/platform-capabilities.md`](docs/platform-capabilities.md). The lab facts, endpoints and
gotchas are in [`ENVIRONMENT.md`](ENVIRONMENT.md).

## Getting started

```bash
git clone git@github.com:vast-team-33/vaast-team-33-project.git
cd vaast-team-33-project
```

Then read [`AGENTS.md`](AGENTS.md). It covers how to run things on your lab VM, the credential
rules and the event rules. Claude Code picks it up through `CLAUDE.md`; Cursor, Codex and Cline
read `AGENTS.md` directly.

## Repo layout

| Path | What |
|---|---|
| `AGENTS.md` | Instructions for coding agents (and humans) |
| `CLAUDE.md` | Claude Code entry point, imports `AGENTS.md` |
| `ENVIRONMENT.md` | Everything known about the lab, checked live on 17 Oct |
| `docs/platform-capabilities.md` | Results of testing every platform feature |
| `docs/api-contract.md` | Backend contract for the frontend (endpoints, types, rules) |
| `docs/frontend.md` | Frontend plan: React, Tailwind 4, shadcn/ui, screens, deploy limits, open tasks |
| `api/openapi.yaml` | The contract as OpenAPI 3.1 (generate TypeScript types from it) |
| `api/fixtures/` | Real example responses, thumbnails and background frames for mocking |
| `docs/ideas.md` | Ideas we explored today and why we picked this one |
| `.claude/skills/` | Links to the event skills |
| `vendor/vast-builders-challenge/` | Copy of the event repo (skills, rules, docs); see `VENDORED.md` inside |

## Open tasks

Tracked as [GitHub issues](https://github.com/vast-team-33/vaast-team-33-project/issues), labelled by area
(`frontend`, `backend`, `pipeline`, `design`, `deploy`, `submission`) and priority (`P0` must have, `P1` should, `P2` nice).

## Submission (due 16:30 BST)

At https://tokensand.com/vastlondon → **Submit your project**: this repo (reviewers need
access), a short demo video link, what we built and the tools used, team names and emails.
