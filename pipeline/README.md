# pipeline/

Experiment pipeline that mines "pedestrian in the car's path" events from the Toronto dashcam footage.
Code runs on the lab VM `bc-systerr` (deployed copy in `~/pipeline`, data in `~/jaywalk/web/`). No data or images are committed.

## Stages

| Stage | Script | Needs | Reads | Writes (in `$JAY_DATA/web/`) |
|---|---|---|---|---|
| 1. mine | `mine.py [top_n]` | GPU (YOLO, Cosmos3-Reason, S3) | S3 detections + video | `raw.json`, `clips/`, `thumbs/` |
| 1b. judge position | `judge_position.py` | W&B Inference only | `raw.json`, `thumbs/` | `raw_vl.json` |
| 2. build | `build.py` | nothing | `$RAW_IN` (default `raw.json`) | `$EVENTS_OUT` (default `events.json`) |

## Run on the VM

```bash
scp pipeline/*.py bc-systerr:pipeline/
ssh bc-systerr 'bash -s' <<'REMOTE'
set -a; source /config/team-33.config; set +a
cd ~/pipeline
JAY_DATA=~/jaywalk ~/exp/venv/bin/python judge_position.py
RAW_IN=raw_vl.json EVENTS_OUT=events_vl.json JAY_DATA=~/jaywalk ~/exp/venv/bin/python build.py
REMOTE
```

Output files on the VM: `~/jaywalk/web/raw_vl.json`, `~/jaywalk/web/events_vl.json` (same schema as `events.json`;
the original `raw.json` / `events.json` are untouched).

## The position judge (issue #9, #12)

Cosmos3-Reason often says `on_road` for people standing on the right-hand sidewalk. `judge_position.py` sends each
thumbnail (the person to judge is in a RED box) to `nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B` and asks for JSON
`{position: on_road | on_crosswalk | on_sidewalk_or_curb | unclear, confidence, reason}`.
In `raw_vl.json` each event's `verdict.pedestrian_position` is replaced by the VL answer when confidence >= 0.5 and the
answer is not `unclear`; the original is kept in `verdict.cosmos_position`. Added: `verdict.position_source`
(`nemotron_vl` | `cosmos`), `verdict.position_reason`, `verdict.vl_position`, `verdict.vl_confidence`.
The call is wrapped in `@weave.op` (W&B project `vastdata/team-33`, traces at https://wandb.ai/vastdata/team-33/weave).
At most 2 calls in flight; the 24 events take about 1-2 minutes.

## Results (24 events)

Position counts: Cosmos `on_road` 19, VL `on_road` 7. 16 of 24 positions changed (all 24 were VL-confident, 0.90-1.00).

I looked at 9 thumbnails myself (all changed ones plus a few kept ones):

| Event (chunk) | Cosmos | VL | What I see | Right |
|---|---|---|---|---|
| set04 c28 | on_road | sidewalk | man standing on the sidewalk by a mural wall | VL |
| set04 c15 | on_road | crosswalk | pedestrians on a zebra crossing | VL |
| set03 c19 | on_road | on_road | person at the right curb edge next to a green bike lane, in shadow | neither (curb/bike lane), both wrong |
| set04 c22 | on_crosswalk | on_road | woman in yellow walking across the street, no zebra under her | VL |
| set06 c18 | on_road | sidewalk | man on the right sidewalk next to parked cars | VL |
| set01 c27 | sidewalk | on_road | a cyclist riding in the lane (not a pedestrian) | VL (position), but it is a cyclist |
| set02 c29 | on_road | crosswalk | woman walking on a zebra crossing | VL |
| set06 c11 | on_road | on_road | man walking in the lane between cars | both |
| set02 c25 | on_road | crosswalk | man on a zebra crossing | VL |

Precision of `on_road` on this sample (a sample of 9, not the full set; treat as indicative):
- Before (Cosmos): 7 events labelled `on_road` in the sample, 1 truly on the road (set06 c11) -> about 1/7 (14%).
- After (VL): 4 events labelled `on_road` in the sample, 3 right (set04 c22, set01 c27, set06 c11), 1 wrong (set03 c19) -> 3/4 (75%).
- Total `on_road` events fell from 19 to 7, which removes most of the sidewalk and crosswalk false alarms. I did not
  check the 15 events I did not view, so recall of true `on_road` events is not measured.

Caveats: VL labels people on a zebra crossing `on_crosswalk`, which the danger score (`build.py`, `LOC`) weights at 0.6, so
some events drop in rank by design. VL can be confidently wrong at curb/bike-lane edges (set03 c19), and it does not
separate pedestrians from cyclists (set01 c27).
