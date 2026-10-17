# Lab environment: VAST Builders Challenge, London

Everything known about the hackathon setup. Checked live on 17 Oct 2026 around 11:20 BST
from the lab VM, unless a line says it comes from the docs.

## The event

- **Real-Time Video Agents Hack**, London leg of the VAST Builders Challenge. Run by tokens&
  with VAST Data, NVIDIA, SpaceXAI (Cursor), CoreWeave and Weights & Biases.
- **Schedule (BST):** 08:30 doors, 09:00 keynotes, 09:30 build, 12:30 lunch,
  **16:30 submission deadline and demos**, 18:30 awards.
- **Teams** of 2 to 4. One project per team.
- **Submit** at https://tokensand.com/vastlondon (button "Submit your project"):
  - a GitHub repo that reviewers can open,
  - a short demo video with a shareable link,
  - a description of what you built and the tools you used,
  - team members' names and contact emails,
  - optional: a working site link and a screenshot.
- **Judges:** Abubakr Karali (NVIDIA), Ram B. (VAST Data), Brian Verkley (VAST Data),
  Junaid Butt (W&B). First round of judging is a walkthrough with each team.
- **Prizes:** 1st NVIDIA DGX Spark, 2nd Hugging Face Microduck, plus credits and gift cards.
- **Rule:** do not ingest video from the internet. The provided footage was picked for its licence.
- **Help:** run the `ask-cosmos` skill. It writes a note but does not post it. Post it yourself
  on https://community.vastdata.com/t/about-the-workshop-category/1969
- **Earlier rounds:** https://tokensand.com/vastnyc/projects and https://tokensand.com/vastsf/projects
  (86 projects, mostly near-miss and safety detectors on the default captions).

## Your team

| Thing | Value |
|---|---|
| Team / namespace | `team-33` |
| Pipeline name | `team-33-vss` |
| Ready-made UI (Search, Explore, Dashboard) | https://team-33-vss.thecosmoslabs.com |
| Backend API host (`INGRESS_URL`) | `video-lab-team-33.cosmos.vastdata.com` |
| Your deployed app, for judges | https://workshop.thecosmoslabs.com, then the **App** button |

The whole team shares one index and one set of credentials. Anything one person ingests
shows up in everyone's searches.

## The lab machine `bc-systerr`

Each teammate has their own lab VM; the examples use `bc-systerr`. Swap in your own SSH alias.

- **Connect:** `ssh bc-systerr`. The `~/.ssh/config` entry goes through `cloudflared access ssh`.
- **Machine:** Ubuntu 24.04, 8 vCPU, 9.7 GiB RAM, 61 GB disk (55 GB free). **No GPU.**
- **Installed:** Python 3.12.3 with `requests` and `boto3`, git, curl, jq, ffmpeg 6.1,
  kubectl 1.37 (team-33 namespace only), the Cursor server, and Claude Code 2.1.302.
- **Not installed:** Node, Docker, pip. The `venv` module exists but `ensurepip` does not.
  Passwordless sudo works, so install pip with:
  ```bash
  sudo apt-get install -y python3-pip python3-venv
  ```
- **Repos:** `~/vast-builders-challenge` (event repo with the skills) and `~/vss-blueprint`
  (pipeline source). This repo carries a copy of the event repo in `vendor/vast-builders-challenge/`.
- **Claude Code on the VM:** installed today. The event repo there has a `CLAUDE.md` and
  `.claude/skills/` links to the Cursor skills. Both are excluded from git. First run asks you to log in:
  ```bash
  ssh bc-systerr
  cd ~/vast-builders-challenge
  claude
  ```

## Credentials

Values live only on the VM in `/config/team-33.config`. **Never copy them here or print them.**

Files in `/config/`: `team-33.config`, `team-33-k8s.yaml` (kubeconfig),
`team-33-backend-secret.yaml`, `team-33-vss2-secret.yaml`.

Variable names: `USERNAME`, `PASSWORD`, `INGRESS_URL`, `S3_ENDPOINT`, `ACCESS_KEY`, `SECRET_KEY`,
`S3_CHUNKS_BUCKET`, `S3_SEGMENTS_BUCKET`, `VASTDB_BUCKET`, `VDB_SCHEMA`, `VDB_COLLECTION`,
`VDB_PROMPTS_COLLECTION`, `WANDB_API_KEY`, `WANDB_TEAM`, `WANDB_PROJECT`, `GPU_BEARER_TOKEN`,
`KUBECONFIG`, `TEST_TOKEN`.

Load them inside the command that needs them:
```bash
set -a; source /config/team-33.config; set +a
```
`vendor/vast-builders-challenge/config.example` describes each variable.

## What is indexed for team 33

Live dashboard at 10:19 UTC: **612 videos, 3,537 segments of about 5 s each, all indexed,
pipeline healthy, no re-ingests yet.** Captions and detections are present on 100% of segments.

| Camera | Segments | Location | What it is |
|---|---|---|---|
| `pie_cam-3` | 1,080 | toronto | Forward dashcam drives |
| `nyc_bike_gopro-1` | 465 | new_york | First-person bike camera (not in the event docs) |
| `nyc_streets_cam-1` | 360 | new_york | Street camera (not in the event docs) |
| `neighborhood_cam-1` | 307 | neighborhood | Residential street, two days |
| `i24_cam-1` | 180 | nashville | Overhead multi-camera highway |
| `nyc_streets_cam-2` | 180 | new_york | Street camera |
| `sf_streets_cam-1` … `cam-5` | 725 total | san_francisco | Five fixed street cameras |
| `smartspace_cam-1` | 180 | indoor | Indoor facility |
| `sdg_warehouse_cam-2` | 60 | warehouse3 | Warehouse aisles |

- **Capture types:** streets 2,937, traffic 360, crowds 180, warehouse 60.
- **Top object classes found by YOLO** (segments containing them): car 3,428, person 2,962,
  truck 2,478, traffic light 2,180, bicycle 1,813, bus 1,366, handbag 874.
- **Caption length:** median 586 characters over 25 search hits. The maximum is about 1,024.
- **Caption quality varies a lot.** The top hit for "truck changing lanes" had the caption
  "A car is driving on the road."

## Backend API

Log in, then send `Authorization: Bearer <token>` on every call. The TLS chain is
self-signed, so use `verify=False` in Python or `curl -k`.

```bash
POST /api/v1/auth/login        {"username": ..., "password": ...}  ->  {"access_token": ...}
```

| Method and path | What it does | Checked |
|---|---|---|
| `GET /api/v1/metadata/ingest-config` | Prompt presets, field options, custom prompt limit (no auth) | yes |
| `GET /api/v1/dashboard/stats?scope=all` | Counts, cameras, object classes, pipeline health | yes |
| `GET /api/v1/videos/explore?scope=all&limit=100&offset=0` | Browse indexed videos (`chunks`, `total`) | yes |
| `POST /api/v1/search` `{"query": ..., "top_k": N}` | Hybrid search over captions and visual vectors | yes |
| `GET /api/v1/videos/metadata?source=...` | One segment's row | docs |
| `GET /api/v1/videos/stream?source=...` | Play a clip | docs |
| `POST /api/v1/videos/upload` (multipart) | New video: `file`, `custom_prompt`, `scenario`, `tags`, `camera_id`, `capture_type`, `location` | docs |
| `POST /api/v1/videos/synthesize` | Summary of one whole video | docs |
| `POST /api/v1/agent/ask` `{"question", "original_video"?, "top_k"}` | Answer with evidence | docs |
| `POST /api/v1/agent/search-and-answer` | Search, then answer | docs |
| `GET /api/v1/tools/segments?original_video=...` | All segment rows of one video | docs |
| `GET /api/v1/tools/segment?source=...` | One segment row | docs |
| `GET /api/v1/tools/detections?source=...` | YOLO bounding boxes for one segment | docs |
| `GET /api/v1/suggestions` | Suggested queries and key events | docs |
| `DELETE /api/v1/videos?original_video=...` | Delete one video and its rows | docs |

Re-ingest has no single documented call here. Use the `ingest-reingest-videos` or
`ingest-reingest-chunk` skill, which shows the exact request.

**Search response** (checked): top-level keys `results`, `chunk_results`, `total`, `chunk_total`,
`query`, `embedding_time_ms`, `search_time_ms`, `permission_filtered`, `llm_synthesis`, `sql_query`.

Each `results[]` item has: `source` (an `s3://` URI of the segment mp4), `similarity_score`,
`reasoning_content` (the caption), `segment_number`, `segment_start_sec`, `segment_end_sec`,
`total_segments`, `duration`, `original_video`, `filename`, `camera_id`, `capture_type`, `location`,
`object_classes`, `object_counts`, `detection_count`, `detection_frame_count`, `max_detection_conf`,
`detection_sidecar_uri`, `perception_json`, `perception_ok`, `perception_source`, `cosmos_model`,
`tags`, `extra_metadata`, `upload_timestamp`, `is_public`, `tokens_used`, `cached_prompt_tokens`.

Each `chunk_results[]` item groups hits by parent video: `original_video`, `best_match_start_sec`,
`best_match_end_sec`, `best_segment_number`, `matched_segment_count`, `preview_source`, `timeline`,
`chunk_index`, `stream_id`, `stream_chunk_total`, plus the same metadata fields.

## Storage layout (S3)

The TLS chain is self-signed, so create the boto3 client with `verify=False`.

- **Chunks bucket** `team-33-vss-chunks`, 613 mp4 files:
  `team-33/<YYYYMMDD_HHMMSS>_<name>_chunk_NNNN.mp4`
- **Segments bucket** `team-33-vss-chunks-segments`, 3,537 mp4 files of about 4 MB each:
  - `segments/<...>_chunk_NNNN_segment_00K_of_006.mp4`
  - `detections/<same name>.json.gz` holds the YOLO sidecars.
  - The listing starts with the detection files, so list with `Prefix="segments/"`.
- The `source` in a search result points straight at the segment mp4. Download it to caption it yourself.
- **VastDB:** bucket `team-33-vss-db`, schema `vss-schema`, search table `vss-collection`.
  The `VDB_PROMPTS_COLLECTION` table holds the prompt suggester's output.

## Ingest and re-ingest

- **Prompt presets** (`scenario`): `surveillance` (Incident & Safety Detection),
  `traffic` (Vehicle & Pedestrian Monitoring), `live_driving` (Live Driving & Road Safety),
  `nhl`, `sports`, `retail`, `warehouse`, `nyc_control`, `nyc_safety_surveillance`,
  `egocentric` (First-Person Activity Analysis), `general`.
- **Custom prompt:** at most 800 characters. It overrides the scenario.
- **Re-ingest replaces the existing captions in place.** It cannot keep two prompt versions side by side.
- Re-ingest takes a few minutes.
- The organisers ask one or two people per team to run bulk re-ingests, and never hours of video.
- The stored row does not record which prompt produced it.
- Leaving the prompt blank on a re-ingest reuses the original ingest prompt.

## GPU models (shared by all teams)

Host `166.19.38.112`. Send `Authorization: Bearer $GPU_BEARER_TOKEN`; it works with the token.
`config.example` says no token is needed, but the skills send it. Keep concurrency low,
because every team shares these models.

| Port | Model id | Use | Health check |
|---|---|---|---|
| 8001 | `nvidia/cosmos3-nano-reasoner` | Caption or answer about video. OpenAI-style chat | `/v1/models`, `/v1/health/ready` |
| 8002 | YOLO11 | Object detection. `POST /v1/infer {video_base64, filename, include_frames}` | `/healthz` only |
| 8003 | `nvidia/cosmos-embed1` | 256-dim embeddings of text or mp4 video. `request_type` is `query`, `bulk_text` or `bulk_video` | `/v1/models`, `/v1/health/ready` |
| 8004 | Canary-1B | Speech to text. `POST /v1/audio/transcriptions`. Not in the pipeline | `/v1/health/ready` |

Video goes into the caption model as a content part:
```json
{"type": "video_url", "video_url": {"url": "data:video/mp4;base64,..."}}
```

**Measured:** one 5 s segment of 4 MB took **5.3 s** to caption. It used about 12,000 prompt tokens
and returned 87 output tokens. With a detailed custom prompt, the neighbourhood clip went from
"A car is driving on the road." to a full paragraph naming the parked cars, the white bush,
the lit building and the car entering from the right.

## W&B Inference: the agent's own LLM

- **Base URL:** `https://api.inference.wandb.ai/v1`. It is OpenAI-compatible.
- **Key:** `$WANDB_API_KEY` on the VM. Your own org's W&B key also works.
- **Project:** pass `"$WANDB_TEAM/$WANDB_PROJECT"` as the client's `project` for usage tracking.
- **Tracing and evals:** Weave. `pip install weave`, then `weave.init("<team>/<project>")`.
- **Models available today:**
  - `meta-llama/Llama-3.1-8B-Instruct`, `meta-llama/Llama-3.3-70B-Instruct`
  - `deepseek-ai/DeepSeek-V3.1`, `DeepSeek-V4-Flash-0731`, `DeepSeek-V4-Pro-0813`, `DeepSeek-V4.1-Flash`
  - `Qwen/Qwen3.6-35B-A3B`, `Qwen/Qwen3.8-27B`
  - `google/gemma-4-26B-A4B-it`, `google/gemma-4-31B-it`
  - `openai/gpt-oss-20b`, `openai/gpt-oss-120b`
  - `moonshotai/Kimi-K2.6`, `moonshotai/Kimi-K2.7-Code`
  - `zai-org/GLM-5.2`, `GLM-5.3`, `GLM-5.3-Flash`
  - `nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B`, `NVIDIA-Nemotron-3.5-Lightning-30B-A3B`,
    **`NVIDIA-Nemotron-3.5-Super-VL-120B-A12B`** (vision-language, so it can be a second captioner or a judge)
  - `MiniMaxAI/MiniMax-M3`, `ibm-granite/granite-4.2-8b`, `reflection/Beam-1.0-501B-A23B`

## Deploying your app

Use the `deploy-app-no-registry` skill.

- **Image:** a public `python:3.12-slim`. Your code is mounted from a ConfigMap, up to about 1 MiB.
- **Credentials:** the backend credentials come from a Secret.
- **Address:** Deployment, Service and Ingress at path `/app` on `video-lab-team-33.cosmos.vastdata.com`.
  The Ingress strips `/app`, so serve your routes at `/`.
- **Judges** open https://workshop.thecosmoslabs.com and click **App**.
- **No Docker build and no registry.** Use only the standard library, or pip-install at container start.
- The deliverable must run on the cluster. A server on localhost does not count.
- Build a web app, CLI or script, never a native desktop or mobile app (event rule).

## Skills

The originals are in `vendor/vast-builders-challenge/.cursor/skills/`. `.claude/skills/` links to them.

| Skill | Use it to |
|---|---|
| `build-day-quickstart` | Guided tour: UI, skills, test drive, build |
| `retrieval-login` | Get a backend token |
| `retrieval-search` | Find moments, with filters for time, location, camera, tags |
| `retrieval-agent-qa` | Ask a question and get an answer with evidence |
| `retrieval-videos` | Browse, play a clip, read captions and detections, summarise a video |
| `retrieval-dashboard` | Check what is indexed and whether ingest is healthy |
| `retrieval-list-metadata` | Live list of prompt presets and field options |
| `retrieval-suggest-prompts` | Generated example queries and key events |
| `ingest-upload-video` | Upload a new local video |
| `ingest-reingest-videos` | Re-run a whole indexed video with a new prompt or metadata |
| `ingest-reingest-chunk` | Re-run one chunk, found by filename, scene, date or camera |
| `gpu-models` | Guide to calling the four GPU models directly |
| `gpu-model-health`, `gpu-model-smoke-test` | Check the GPU models |
| `vast-database-vastdb-read`, `vast-database-vastdb-write` | Query or write the database directly |
| `deploy-app-no-registry` | Ship your app to `/app` on the cluster |
| `deploy-health`, `deploy-retrieval`, `deploy-build-yamls` | The organisers' stack. Not for your app |
| `ask-cosmos` | Health check plus a help note to post on Cosmos |

## Gotchas found today

- **Self-signed TLS on S3 and the backend.** Use `verify=False` in boto3 and requests.
- **The first page of the segments bucket holds only detection files.** List with `Prefix="segments/"`.
- **zsh reserves `USERNAME`.** Parse the config file in zsh instead of sourcing it (from the deploy skill).
- **The event repo on the VM may be behind.** Run `git pull` there if a skill misbehaves.
- **The skills say `AskQuestion`.** That is Cursor's tool. In Claude Code it is `AskUserQuestion`.
- **`INGRESS_URL` already includes the scheme** (`http://…`). Don't prepend `https://`.
- **Pods can't resolve the team host.** Inside the cluster, call the backend at
  `http://video-backend-service:8000`. S3 (`S3_ENDPOINT`) is reachable from pods as is.
- **The uploads processed 0 clips** (5 files, 17 Oct). The architecture doc says the Segmenter is not
  in the challenge path. VAST said they can enable it.
- **YOLO on the indoor warehouse:** black humanoid robots come out as `person`, and the yellow carts
  (AGVs) are almost never detected (occasionally as `truck` or `car`).
- **Embed1 `request_type`** is `query`, `bulk_text` or `bulk_video`. `passage` returns 422.
  Video works as `data:video/mp4;base64,…`. An image data URI returns 200 but is silently treated
  as text: wrap a JPEG in a 1 s mp4 instead.
- **Canary:** omit `model` (the skill's `nvidia/canary-1b` returns 400). Send a 16 kHz mono WAV;
  mp4 returns 500. Audio exists only on the SF, NYC street and NYC bike footage.
- **Box coordinates from Cosmos and Nemotron VL are normalised 0–1000**, even when pixels are asked for.
- **Nemotron-3.5-Super-VL on W&B** counted humans, robots and carts correctly on a warehouse frame
  and boxed all 4 carts. Cosmos found 2 of 4 carts, YOLO almost none. Tested on one frame only.
- **Reasoning models on W&B** (DeepSeek-V4-Pro, Nemotron VL) spend most tokens on reasoning:
  `max_tokens=400` returned no content. Use about 3000.
- **ffmpeg inside `ssh 'bash -s' <<heredoc`** swallows the rest of the script from stdin. Pass `-nostdin`.
- **Global `POST /agent/ask` (no `original_video`) returns 500.** Per-video `/agent/ask` works;
  for global questions use `/agent/search-and-answer`.
- **Every search with hits also runs Cosmos synthesis** (about 2 s, shared GPU, no off switch).
  `system_prompt` overrides it; strip a leading `<think></think>`.
- **`metadata_filters` takes any column:** `{"original_video": …}`, `{"segment_number": 4}`,
  `{"object_classes": "person"}` (LIKE match). `time_filter` filters on upload time, not recording
  time. All `tags` are empty. Similarity scores run about 0.2 to 0.47.
- **The indoor warehouse is `capture_type=crowds`, `location=indoor`**, not `warehouse`.
- **`/videos/stream`** needs the JWT as `?token=` and supports Range, but returns
  `binary/octet-stream`. `/videos/chunk` and `/streaming/*` return 404.
- **Never call `/api/v1/batch-sync/prefill` from an app:** it returns the S3 keys in plain text.
- **VastDB SDK:** `vastdb.connect(endpoint=$S3_ENDPOINT, access=…, secret=…, ssl_verify=False)`. It prints a
  harmless "elysium" RPC warning each time a table opens. `get_stats().num_rows` lags, so count with a scan.
  Our own schema is `team33_app` (`experiment_notes` holds test rows).
- **Re-ingest:** `POST /api/v1/dashboard/reingest {"original_video", "chunk_count", "custom_prompt"?}`
  took 6–9 min per chunk, mostly queueing. Status at `GET /api/v1/dashboard/reingest/<job_id>` often
  returns 404 (it is kept in one backend instance's memory), so check the rows in VastDB instead.
  After a re-ingest, `pipeline_alignment.healthy` stays `false`: the dashboard counts the copies under
  `segments/reingest/`. The index itself is fine. Neighbourhood chunk 0005 was re-ingested on 17 Oct,
  then restored with its original prompt.
- **Uploads on 17 Oct:** 6 files (2 mp4, 4 avi) in the chunks bucket, none processed.
