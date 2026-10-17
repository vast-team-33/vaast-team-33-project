# Crossing Risk API: backend contract for the frontend

The source of truth is [`../api/openapi.yaml`](../api/openapi.yaml). Real example responses for every
endpoint are in [`../api/fixtures/`](../api/fixtures/), taken from today's pipeline run on the
Toronto dashcam footage (24 events). Build against the fixtures now; switch to the live backend
when it serves this contract.

## Rules that matter for the frontend

- **Relative URLs only.** Production serves the app at `https://…/app/` and the Ingress strips `/app`.
  Call `api/events`, never `/api/events`. Build with Vite `base: './'`.
- Media URLs come back ready to use: `clip_url` (mp4 with HTTP Range, so seeking works) and
  `thumb_url` (jpg, person boxed in red at the closest moment).
- Coordinates (`person_bbox`, detection boxes, `lane_polygon`) are pixels in a `frame_w × frame_h`
  frame (1920 × 1080). Scale them to the displayed video size.
- `speeds` and `suggested_speeds` are relative units, one sample every 0.2 s (about 25 per clip).
  Show them as a chart without a unit, never as km/h.
- Errors are `{"error": {"code": "...", "message": "..."}}` with status 400, 404, 413 or 500.
- **Export is a demo.** `POST api/events/{id}/export` always answers `202` with `demo: true`. The UI
  must say sending is simulated. The scenario package from `GET api/events/{id}/scenario` is real.

## Endpoints

| Method | Path | What | Fixture |
|---|---|---|---|
| GET | `api/health` | `{"ok": true}` | |
| GET | `api/summary` | Headline numbers for the dashboard | `summary.json` |
| GET | `api/config` | Lane polygon, score formula and weights, allowed feedback choices | `config.json` |
| GET | `api/events?min_danger&agreement&crossing&position&drive&has_feedback&sort&limit&offset` | Page of events, highest danger first by default | `events.json` |
| GET | `api/events/{id}` | One event | `event.json` |
| GET | `api/events/{id}/detections` | Boxes 10 times a second, for a video overlay | `detections.json` |
| POST | `api/events/{id}/feedback` | `{"choice": "driver_right" \| "model_right" \| "both_fine" \| "false_alarm", "note"?}` → 201 | |
| GET | `api/feedback?event_id` | All labels | `feedback.json` |
| GET | `api/events/{id}/scenario` | Simulator-ready scenario package | `scenario.json` |
| POST | `api/events/{id}/export` | `{"target": "cosmos_transfer" \| "omniverse" \| "openscenario"}` → 202, demo | `export.json` |
| GET | `api/detectors` | Built-in and user-created detectors | `detectors.json` |
| POST | `api/detectors` | `{"name", "prompt", "description"?, "prefilter"?: {"object_class", "in_lane"}}` → 201, status `draft` | `detector.json` |
| GET | `api/detectors/{detector_id}` | One detector | `detector.json` |
| POST | `api/detectors/{detector_id}/preview` | Try it on **one** sample clip, `{"event_id"?}` → result in about 5–7 s | `preview.json` (real) |
| POST | `api/detectors/{detector_id}/runs` | Run over the whole set, `{"drives"?, "max_clips"?: 50}` → 202 Run; 409 if one is running | `run.json` |
| GET | `api/runs/{run_id}` | Progress; poll every 2–5 s | `run.json` |
| POST | `api/detectors/{detector_id}/export` | Send all of a detector's events to a simulator → 202, demo | `export.json` |
| GET | `media/clips/{id}.mp4` | The 5 s clip | |
| GET | `media/thumbs/{id}.jpg` | Thumbnail | `media/thumbs/` |

## Types (TypeScript)

```ts
type PedestrianPosition = "on_road" | "on_crosswalk" | "on_sidewalk_or_curb" | "none";
type CrossingLocation = "marked_crosswalk" | "outside_crosswalk" | "not_crossing" | "unclear";
type Risk = "none" | "low" | "medium" | "high";
type ActualAction = "kept_speed" | "slowed_down" | "stopped" | "was_stopped" | "accelerated" | "unknown";
type SuggestedAction = "stop" | "slow_down" | "proceed_with_caution" | "proceed" | "unknown";
type Agreement = "driver_less_careful" | "driver_as_careful" | "driver_more_careful" | "unknown";
type FeedbackChoice = "driver_right" | "model_right" | "both_fine" | "false_alarm";
type Bbox = [x1: number, y1: number, x2: number, y2: number];   // pixels

interface Event {
  id: string;                    // segment name, also used in URLs
  drive: string;                 // "set04"
  chunk: number; segment: number;
  drive_time_sec: number;        // where this clip starts in the drive
  peak_sec: number;              // closest approach, seconds into the clip
  danger: number;                // 0–100
  factors: { closeness: number; exposure: number; location: number; moving: number };
  pedestrian_position: PedestrianPosition;
  crossing_location: CrossingLocation;
  risk: Risk;
  reason: string;                // one sentence from the judge model
  actual_action: ActualAction;   // measured from the video
  suggested_action: SuggestedAction;
  agreement: Agreement;
  speeds: number[];              // measured, every 0.2 s, relative units
  suggested_speeds: number[];    // if the car had followed the suggestion
  person_bbox: Bbox;
  frame_w: number; frame_h: number;
  frames_in_lane: number;        // at 30 fps
  clip_url: string; thumb_url: string;
  feedback: Feedback | null;
}

interface Feedback { id: string; event_id: string; choice: FeedbackChoice; note?: string; created_at: string }

interface Scenario {
  scenario_id: string; source_event_id: string; format: string; summary: string; danger: number;
  ego: { actual_action: ActualAction; suggested_action: SuggestedAction; speed_sample_sec: number;
         speed_profile_rel: number[]; suggested_speed_profile_rel: number[] };
  actors: { type: "pedestrian"; position: PedestrianPosition; crossing_location: CrossingLocation;
            image_track: { t: number; bbox: Bbox }[] }[];
  environment: Record<string, string>;
  variations: string[];          // e.g. "same scene at night", "a child instead of an adult"
  generation_prompt: string;     // text for a world model such as NVIDIA Cosmos Transfer
  targets: { id: "cosmos_transfer" | "omniverse" | "openscenario"; label: string }[];
}

interface Export { export_id: string; event_id: string; target: string; status: "queued";
                   demo: true; message: string; created_at: string }

// User-defined detectors: write a prompt, test it on one clip, then run it on the whole set.
interface DetectorInput {
  name: string;                  // "Cyclist close to the car"
  prompt: string;                // ≤ 800 chars, plain words
  description?: string;
  prefilter?: { object_class?: string; in_lane?: boolean };  // cheap YOLO filter before the judge model
}
interface Detector extends DetectorInput {
  id: string; kind: "builtin" | "user";
  status: "draft" | "tested" | "running" | "active" | "failed";
  created_at: string; last_run_id: string | null; event_count: number;
}
interface PreviewResult {
  detector_id: string; sample_event_id: string; latency_ms: number; model: string;
  result: { match: boolean; confidence: number; moment_sec: number | null; reason: string };
}
interface Run {
  run_id: string; detector_id: string; status: "queued" | "running" | "completed" | "failed";
  progress: { done: number; total: number }; matched: number;
  started_at: string; finished_at: string | null; estimated_seconds?: number; error?: string;
}
// Every Event also has detector_id ("crossing_risk" for the built-in one). Filter with api/events?detector_id=.
```

**Detector flow in the UI:** create (draft) → preview on one clip (tested) → run on the set (running →
active) → the matches appear as events → export them (demo). A run costs about 3 s per candidate clip on
the shared GPU, so `max_clips` defaults to 50 (roughly 2–3 minutes).

Generate the same types automatically with `npx openapi-typescript api/openapi.yaml -o src/api/types.ts`.

## Status

The live backend still serves the experiment's older shape (`events.json`, `POST feedback`). The next
backend step is to serve exactly this contract from the same data. Until then, use the fixtures.
