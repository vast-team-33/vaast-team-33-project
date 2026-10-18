# Drive Loop: a self-training data engine for self-driving cars

Self-driving fleets record petabytes of camera video. Drive Loop keeps it on reliable VAST storage, finds the moments that matter with NVIDIA models, lets people check them, and turns each one into simulated training data for the next model. The built-in scenario today is pedestrians stepping into the road (formerly called Crossing Risk).

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

> **Status:** the event is over and the lab is offline. The [archived demo](#archived-demo) runs
> without it.

## Links

| What | Link |
|---|---|
| Archived demo (works now) | https://vast-team-33.github.io/vaast-team-33-project/ |
| The whole idea, as an interactive diagram | https://vast-team-33.github.io/vaast-team-33-project/idea.html |
| Demo video | https://youtu.be/cKueRONRbL0 |
| Project page | https://tokensand.com/p/drive-loop |
| Hackathon: Real-Time Video Agents Hack, London, 17 Oct 2026 | https://tokensand.com/vastlondon |
| All projects | https://tokensand.com/vastlondon/projects |
| Event on Luma | https://luma.com/vastlondon |
| Event repo (VAST Builders Challenge: rules, skills, platform) | https://github.com/vast-data/vast-builders-challenge |
| Live app during the event (lab sign-in only, now offline) | https://team-33-app.thecosmoslabs.com/app |

Built with
[VAST Data](https://www.vastdata.com/platform/ai-os) (storage, VastDB, the VSS pipeline),
[NVIDIA VSS](https://docs.nvidia.com/vss/latest/) and [NVIDIA Cosmos](https://www.nvidia.com/en-us/ai/cosmos/) models,
[CoreWeave](https://coreweave.com/) GPUs,
[W&B Inference](https://docs.wandb.ai/inference) and [Weave](https://wandb.ai/site/weave/), and
[Cursor](https://cursor.com/).

## Team

Team 33: Andrei Lahunou,
[Dimitrios Koutsoumpos](https://www.linkedin.com/in/koutsoubosdimitrios/),
[Divya Bisht](https://www.linkedin.com/in/divyabishtx/) and
[Vladimir Lebedev](https://www.linkedin.com/in/lebedevv/).

Contact: Andrei Lahunou.

## Archived demo

**https://vast-team-33.github.io/vaast-team-33-project/**

A read-only snapshot of the app with data that was already processed during the event: the VAST
Data VSS pipeline (video segments and YOLO11 boxes) and our own steps on the lab GPUs (NVIDIA
Cosmos3-Reason, Nemotron VL position judge, optical-flow speed). There is no backend: labels are
not saved and new detectors cannot run. It holds 20 events, all with video; cyclists and duplicate
clips were removed, as in the final live version. Faces and number plates are blurred.

The lab's copies of the clips went offline with the lab. The footage is the public
[PIE dataset](https://data.nvision2.eecs.yorku.ca/PIE_dataset), so the clips were cut again from the
original PIE videos at the same moments: each one was placed by matching its event thumbnail, which
lands within 0.1 s of the event's peak (`scripts/pie_clips.py`, times in `scripts/pie_clip_times.json`).

Each event page names the original PIE video of its clip and links to it at that moment. The
originals are on York University's server and are not blurred. The list:

<details>
<summary>The 20 clips and the original PIE videos they were cut from</summary>

| Event (lab drive, time into it) | Original PIE video | Clip in the original |
|---|---|---|
| set02 · 1:00 into the drive | [set02/video_0001.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set02/video_0001.mp4#t=58.3,63.3) | 0:58.3 to 1:03.3 |
| set02 · 1:45 into the drive | [set02/video_0001.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set02/video_0001.mp4#t=98.3,103.3) | 1:38.3 to 1:43.3 |
| set02 · 12:55 into the drive | [set02/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set02/video_0002.mp4#t=175.0,180.0) | 2:55.0 to 3:00.0 |
| set02 · 14:50 into the drive | [set02/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set02/video_0002.mp4#t=285.0,290.0) | 4:45.0 to 4:50.0 |
| set03 · 2:25 into the drive | [set03/video_0001.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set03/video_0001.mp4#t=143.4,148.4) | 2:23.4 to 2:28.4 |
| set03 · 9:35 into the drive | [set03/video_0001.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set03/video_0001.mp4#t=573.4,578.4) | 9:33.4 to 9:38.4 |
| set03 · 13:30 into the drive | [set03/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set03/video_0002.mp4#t=206.3,211.3) | 3:26.3 to 3:31.3 |
| set04 · 7:40 into the drive | [set04/video_0001.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set04/video_0001.mp4#t=453.7,458.7) | 7:33.7 to 7:38.7 |
| set04 · 9:55 into the drive | [set04/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set04/video_0002.mp4#t=50.0,55.0) | 0:50.0 to 0:55.0 |
| set04 · 10:50 into the drive | [set04/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set04/video_0002.mp4#t=103.3,108.3) | 1:43.3 to 1:48.3 |
| set04 · 11:05 into the drive | [set04/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set04/video_0002.mp4#t=121.6,126.6) | 2:01.6 to 2:06.6 |
| set04 · 11:40 into the drive | [set04/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set04/video_0002.mp4#t=160.0,165.0) | 2:40.0 to 2:45.0 |
| set04 · 14:20 into the drive | [set04/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set04/video_0002.mp4#t=312.0,317.0) | 5:12.0 to 5:17.0 |
| set04 · 14:30 into the drive | [set04/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set04/video_0002.mp4#t=325.3,330.3) | 5:25.3 to 5:30.3 |
| set06 · 5:30 into the drive | [set06/video_0001.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set06/video_0001.mp4#t=328.6,333.6) | 5:28.6 to 5:33.6 |
| set06 · 8:05 into the drive | [set06/video_0001.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set06/video_0001.mp4#t=483.6,488.6) | 8:03.6 to 8:08.6 |
| set06 · 8:55 into the drive | [set06/video_0001.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set06/video_0001.mp4#t=528.7,533.7) | 8:48.7 to 8:53.7 |
| set06 · 9:20 into the drive | [set06/video_0001.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set06/video_0001.mp4#t=557.0,562.0) | 9:17.0 to 9:22.0 |
| set06 · 11:20 into the drive | [set06/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set06/video_0002.mp4#t=78.3,83.3) | 1:18.3 to 1:23.3 |
| set06 · 14:35 into the drive | [set06/video_0002.mp4](https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips/set06/video_0002.mp4#t=271.3,276.3) | 4:31.3 to 4:36.3 |

</details>

To rebuild it:

```bash
python3 scripts/pie_clips.py cut         # missing clips from PIE -> data/demo-snapshot/clips/
# blur the media first, in its own venv (see the header of scripts/blur_media.py)
python scripts/blur_media.py img data/demo-snapshot/thumbs data/demo-media-blurred/thumbs scripts/blur_manual.json
python scripts/blur_media.py vid data/demo-snapshot/clips/<id>.mp4 data/demo-media-blurred/clips/<id>.mp4
python3 scripts/build_archive.py         # data/demo-snapshot + data/demo-media-blurred (git-ignored) -> archive/
cd frontend && npm run build:archive     # -> frontend/dist-archive/ (the app plus archive/)
```

A push to `main` that touches `frontend/` or `archive/` deploys it with
`.github/workflows/pages.yml` (the repo's Pages source must be "GitHub Actions").

## A note on the footage

VAST initially told us we could bring and use our own external video. During the event we found
out that external video was not approved after all: the rules allowed only the footage provided
on the platform, and uploads were accepted but never processed (the Segmenter was not part of the
challenge pipeline). So we had to drop our first idea, which needed our own footage, and build on
the library that was provided: Toronto dashcam footage (`pie_cam-3`), which turned out to be the
public PIE dataset.

**Credit:** PIE dataset by Amir Rasouli, Iuliia Kotseruba, Toni Kunic and John K. Tsotsos, York
University: "PIE: A Large-Scale Dataset and Models for Pedestrian Intention Estimation and
Trajectory Prediction", ICCV 2019. Videos and annotations are released under the MIT License
(`third_party/PIE-LICENSE.txt`, also served with the archive's media).

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
| `archive/` | Static snapshot for the archived demo (API answers as JSON, thumbnails, 20 blurred clips); built by `scripts/build_archive.py` |
| `third_party/` | Licences of outside material we ship (the PIE dataset's MIT License) |
| `docs/ideas.md` | Ideas we explored today and why we picked this one |
| `.claude/skills/` | Links to the event skills |
| `vendor/vast-builders-challenge/` | Copy of the event repo (skills, rules, docs); see `VENDORED.md` inside |

## Open tasks

Tracked as [GitHub issues](https://github.com/vast-team-33/vaast-team-33-project/issues), labelled by area
(`frontend`, `backend`, `pipeline`, `design`, `deploy`, `submission`) and priority (`P0` must have, `P1` should, `P2` nice).

## Submission (due 16:30 BST)

At https://tokensand.com/vastlondon → **Submit your project**: this repo (reviewers need
access), a short demo video link, what we built and the tools used, team names and emails.
