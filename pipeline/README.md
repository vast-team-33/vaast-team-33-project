# pipeline/

Experiment pipeline that mines "pedestrian in the car's path" events from the Toronto dashcam footage.
Code runs on the lab VM `bc-systerr` (deployed copy in `~/pipeline`, data in `~/jaywalk/web/`). No data or images are committed.

## Stages

| Stage | Script | Needs | Reads | Writes (in `$JAY_DATA/web/`) |
|---|---|---|---|---|
| 1. mine | `mine.py [top_n]` | GPU (YOLO, Cosmos3-Reason, S3) | S3 detections + video | `raw.json`, `clips/`, `thumbs/` |
| 1b. judge | `judge_position.py` | W&B Inference only | `$RAW_IN` (default `raw.json`), `thumbs/` | `$RAW_OUT` (default `raw_vl.json`) |
| 2. build | `build.py` | nothing | `$RAW_IN` (default `raw.json`) | `$EVENTS_OUT` (default `events.json`) |

## Run on the VM

```bash
scp pipeline/*.py bc-systerr:pipeline/
ssh bc-systerr 'bash -s' <<'REMOTE'
set -a; source /config/team-33.config; set +a
cd ~/pipeline
JAY_DATA=~/jaywalk RAW_OUT=raw_v3.json ~/exp/venv/bin/python judge_position.py
RAW_IN=raw_v3.json EVENTS_OUT=events_v3.json JAY_DATA=~/jaywalk ~/exp/venv/bin/python build.py
REMOTE
```

Output files on the VM: `~/jaywalk/web/raw_v3.json`, `~/jaywalk/web/events_v3.json` (same schema as `events.json`, plus the
top-level counters below; `raw.json` / `events.json` / `raw_vl.json` / `events_vl.json` are untouched).

## The judge (issues #9, #12, v3: consistent labels, no cyclists, no duplicates)

`judge_position.py` sends each thumbnail (the person to judge is in a RED box) to
`nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B` in ONE call and asks for JSON
`{subject: pedestrian | cyclist_or_scooter | other, position: on_road | on_crosswalk | on_sidewalk_or_curb | unclear,
crossing_location: marked_crosswalk | outside_crosswalk | not_crossing | unclear, confidence, reason}`.
The answer is made consistent in code: `on_crosswalk` forces `marked_crosswalk`, `on_sidewalk_or_curb` forces `not_crossing`.
Unparseable answers are retried (up to 3 times); if a call still fails the event keeps its Cosmos labels and `subject` = `pedestrian`
(never dropped because of an API failure).

When confidence >= 0.5, `verdict.pedestrian_position`, `verdict.crossing_location` and `verdict.reason` come from VL, so a card can no
longer say "on_road + marked crosswalk + reason: on the sidewalk". The Cosmos values are kept in `verdict.cosmos_position`,
`verdict.cosmos_crossing`, `verdict.cosmos_reason`. Always added: `verdict.subject`, `verdict.position_source` (`nemotron_vl` | `cosmos`),
`verdict.position_reason`, `verdict.vl_position`, `verdict.vl_crossing_location`, `verdict.vl_confidence`.
The call is wrapped in `@weave.op` (W&B project `vastdata/team-33`). At most 2 calls in flight; 24 events take about 1-2 minutes.

`build.py` then:
- drops events whose `verdict.subject` is not `pedestrian` (YOLO labels riders "person"); counted in top-level `dropped_non_pedestrian`;
- drops duplicate footage: identical `speeds` arrays, or segment 6 of chunk N + segment 1 of chunk N+1 of the same drive with near-identical
  speeds (max abs difference <= 0.02). The event with the higher danger is kept; counted in top-level `dropped_duplicates`.
The per-event format of `events.json` is unchanged; the two counters are new top-level fields.

## Results (24 raw events -> 20 events in `events_v3.json`)

- Events before / after: 24 / 20. Dropped cyclists: 2 (set01 c27, set05 c12). Dropped duplicates: 2 (set03 c5 seg 1 = set03 c4 seg 6;
  set02 c26 seg 1 = set02 c25 seg 6; identical `speeds`).
- Position counts after: `on_road` 3, `on_crosswalk` 4, `on_sidewalk_or_curb` 13 (Cosmos had `on_road` 19 of 24).
- VL calls are not fully deterministic: borderline sidewalk/curb cases (e.g. set04 c29) can flip between runs.

Eight thumbnails checked by eye:

| Event | Subject | Position | Crossing | VL reason | What I see | Correct? |
|---|---|---|---|---|---|---|
| set04 c22 s2 | pedestrian | on_road | outside_crosswalk | walking on the paved road without crosswalk markings | woman in a yellow jacket walking across the street, no zebra | yes |
| set04 c28 s5 | pedestrian | on_sidewalk_or_curb | not_crossing | walking on the sidewalk next to a building | man in a hat on the sidewalk by a mural wall | yes |
| set04 c19 s6 | pedestrian | on_sidewalk_or_curb | not_crossing | standing on the sidewalk on the right | man on the right sidewalk | yes |
| set04 c29 s1 | pedestrian | on_sidewalk_or_curb | not_crossing | walking along the sidewalk next to the shops | man at the corner curb in front of a shop, not in the lane | yes (curb edge, borderline) |
| set06 c11 s1 | pedestrian | on_road | outside_crosswalk | walking in the middle of the driving lane | man walking in the lane between cars | yes |
| set04 c15 s3 | pedestrian | on_crosswalk | marked_crosswalk | walking across the marked crosswalk | people on a zebra crossing | yes |
| set01 c27 s3 | cyclist_or_scooter (dropped) | on_road | not_crossing | riding a bicycle on the road | cyclist in a helmet at an intersection | yes |
| set05 c12 s2 | cyclist_or_scooter (dropped) | on_road | not_crossing | riding a bicycle | cyclist in a helmet on a bike | yes |

8 of 8 correct on this sample (indicative only; the other 12 events were not inspected).
