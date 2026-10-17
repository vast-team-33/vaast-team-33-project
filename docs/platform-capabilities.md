# Platform capabilities: what works (tested live, 17 Oct 2026)

Each feature was exercised with one small real example from the lab VM. Latencies are single
runs. Exact request shapes and gotchas are in `../ENVIRONMENT.md`.

## Data we get

| What | Detail |
|---|---|
| Archive | 612 videos (30 s chunks), 3,537 segments of 5 s, 4.9 h in total, all indexed |
| Per segment | Cosmos caption, YOLO summary counts, text and visual vectors (256-dim), metadata |
| Per-frame YOLO boxes | Every segment, 30 fps, `{label, confidence, bbox[x1,y1,x2,y2]}` in pixels, no track IDs |
| Storage | S3 buckets with the chunk and segment mp4s plus the YOLO files; readable from VM and pods |

| Footage | Cameras | Length | Real or synthetic | Notes |
|---|---|---|---|---|
| Toronto dashcam `pie_cam-3` | 1, moving | 90 min (6 drives) | Real | Pedestrians, crosswalks, construction zones (`set06`); no audio |
| NYC bike GoPro, NYC street cams | 3 | 84 min | Real | Has audio |
| SF street cams 1–5 | 5 | 60 min | Real | Has audio |
| Neighbourhood cam | 1 | 25.5 min | Real | Quiet street, mostly cars |
| Nashville highway I-24 | 3 | 15 min | Real | Vehicles only |
| Indoor warehouse `smartspace_cam-1` | 3 views, same room | 5 min each | Synthetic | People, humanoid robots, yellow AGV carts |
| Synthetic warehouse `sdg_warehouse_cam-2` | 3 scenes × 10 views | ~10 s each | Synthetic | Workers next to a forklift |

## Features

| Capability | Works? | Speed | Notes |
|---|---|---|---|
| Stored per-frame YOLO boxes | ✅ | 0.1–0.3 s per segment | Finds every real person; robots can count as `person`; carts mostly missed |
| YOLO11 called directly | ✅ | 2.3 s per 5 s clip | Same result as the stored boxes |
| Cosmos3-Reason called directly | ✅ | ~5 s per clip | Good yes/no and descriptions; counts off by 1–2; boxes are 0–1000 normalised |
| Nemotron-3.5-Super-VL (W&B) | ✅ | 2.5–4 s per frame | Most accurate on counts and boxes in our test (one frame) |
| Cosmos Embed1 | ✅ | ~0.1 s text, ~1 s video | 256-dim; video-to-text similarity works; images need a 1 s mp4 wrapper |
| Canary-1B speech to text | ✅ | 0.4 s | Needs a 16 kHz WAV; only SF and NYC footage has audio |
| W&B Inference LLMs (23 models) | ✅ | ~4.5 s | Reasoning models need `max_tokens` around 3000 |
| Weave tracing | ✅ | 0.6 s init | Traces and child calls recorded |
| Search (hybrid, filters) | ✅ | 2.5–3.5 s | `metadata_filters` on any column; always runs a ~2 s LLM synthesis |
| Q&A per video `/agent/ask` | ✅ | ~2.7 s | Text answer, no distances |
| Q&A over all videos `/agent/ask` | ❌ 500 | | Use `/agent/search-and-answer` (✅ ~4.8 s) |
| Video summary `/videos/synthesize` | ✅ | ~4.9 s | Honours a custom `system_prompt` |
| Video streaming `/videos/stream` | ✅ | fast | Range and seeking work; token in the query string |
| Suggestions / key events | ✅ | 18 s full, 19 ms chips only | 1,138 pre-labelled key events |
| VastDB read | ✅ | 20–300 ms | SDK with predicates; both 256-dim vector columns readable; tables `vss-collection`, `vss-prompts-events` |
| VastDB: our own tables | ✅ | ~110 ms create, ~160 ms insert | Created `team33_app.experiment_notes`; no primary key, so inserts can duplicate |
| Re-ingest with a custom prompt | ⚠️ | 6–9 min per chunk | One run stalled at 5 of 6 segments, the restore run finished; job status is unreliable (in memory on one backend instance) |
| Upload a new video | ❌ | | Accepted, never segmented |
| Our own processing and hosting | ✅ | | Deployments, Jobs, CronJobs, ConfigMaps, Secrets in `team-33`; PVCs fail to mount |

## Not available

No video or audio generation model, no text-to-speech, no GPU of our own, no changes to the
organisers' pipeline, no internet footage.
