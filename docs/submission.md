# Submission: ready-to-paste answers

Form: https://tokensand.com/vastlondon → **Submit your project**. Due **16:30 BST**, 17 Oct 2026.

## Project name

Crossing Risk

## One-line pitch

Crossing Risk finds pedestrians stepping into the road in real dashcam footage, scores the danger, compares the driver with an AI model, and turns each moment into a scenario for simulator training.

## What we built (about 200 words)

Crossing Risk searches the Toronto dashcam archive on the VAST VSS platform for people on the road in front of the car. We use stored YOLO11 boxes to find candidates. Cosmos3-Reason watches each clip and says where the person is (road, crosswalk or sidewalk), how risky it is, and what the car should do. We measure what the driver really did with optical flow on the video, and we give each moment a danger score from 0 to 100. Then we compare the driver with the model: more careful, as careful, or less careful.

People can press "who was right?" on each moment. Every answer is a labelled example for later training.

Each moment is also packaged as a simulator-ready scenario file. The "send to simulator" button is a demo. It shows the hand-off, but no simulator is connected yet.

Users can write their own detector in plain words, test it on one clip, and run it on the whole set.

Honest limits: the scoring and the speed are rough (optical flow gives relative units only). Our first run counted people on the sidewalk as "on road"; a second judge (NVIDIA Nemotron VL on the peak frame) fixed that, and also removes cyclists and duplicate clips. We checked 8 of the final events by eye and all 8 were labelled correctly; the rest are unchecked.

## Numbers (from the 17 Oct run)

- 1,080 clips scanned (5 s each, Toronto dashcam, 6 drives)
- 558 candidate moments (a person in the car's lane for at least 1/3 s)
- 24 closest moments judged by Cosmos3-Reason, then checked by Nemotron VL: 2 cyclists and 2 duplicate clips removed, 20 events left
- Where the person is: 3 on the road outside a crosswalk, 4 on a marked crosswalk, 13 on the sidewalk or curb
- Driver vs model: 10 as careful, 8 less careful, 2 more careful
- Eyeball check: 8 of 8 checked events labelled correctly (12 unchecked)
- Live detector test: a user-written detector ran on one clip on the shared NVIDIA GPU in 4.6 s

Source: the live app's `api/summary` and `api/events`, 17 Oct.

## Tools used

- VAST Data VSS stack: the indexed video archive and retrieval backend
- VastDB (stored per-frame detections and results)
- S3 on VAST (video chunks, thumbnails)
- NVIDIA Cosmos3-Reason (judge: location, risk, suggested action)
- YOLO11 (person detection, boxes stored per frame)
- NVIDIA Cosmos Embed1 (tested, not in the final pipeline)
- NVIDIA Nemotron-3.5-Super-VL via W&B Inference (sidewalk vs road check, in progress)
- W&B Weave (tracing)
- Kubernetes on CoreWeave (deploy)
- Claude Code with Sonnet and Opus agents (we built the project with them)
- Python 3.12, OpenCV optical flow
- React, Tailwind 4, shadcn/ui

## Links

- Repo: https://github.com/vast-team-33/vaast-team-33-project
- Demo video: TODO
- Live app: https://workshop.thecosmoslabs.com → click **App**

## Team

| Name | Email |
|---|---|
| TODO | TODO |
| TODO | TODO |
| TODO | TODO |

## Checklist before you submit

- [ ] Reviewers can open the repo (add them, or make it public)
- [ ] Remove the batch-sync / prefill line from `AGENTS.md` and `ENVIRONMENT.md` before the repo is public
- [ ] No credentials in the repo (check `git log` and files)
- [ ] Demo video is uploaded and the link works in a private window
- [ ] Video is under 2:10 and has sound
- [ ] Live app opens at https://workshop.thecosmoslabs.com → App
- [ ] Numbers in the form match `api/fixtures/summary.json`
- [ ] Team names and emails are filled in
- [ ] "Send to simulator" is described as a demo everywhere
- [ ] Submit before 16:30 BST
