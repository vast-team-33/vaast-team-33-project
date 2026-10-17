# Fixtures

Real responses for every endpoint in `../openapi.yaml`, generated from the 17 Oct pipeline run on
the Toronto dashcam footage (24 events). Use them to build and mock the frontend.

| File | Endpoint |
|---|---|
| `summary.json` | `GET api/summary` |
| `config.json` | `GET api/config` |
| `events.json` | `GET api/events` |
| `event.json` | `GET api/events/{id}` (the top event) |
| `detections.json` | `GET api/events/{id}/detections` (the top event) |
| `feedback.json` | `GET api/feedback` (one example label) |
| `scenario.json` | `GET api/events/{id}/scenario` (the top event) |
| `export.json` | `POST api/events/{id}/export` (demo response) |
| `detectors.json` | `GET api/detectors` (built-in plus one user detector) |
| `detector.json` | `POST api/detectors`, `GET api/detectors/{id}` |
| `preview.json` | `POST api/detectors/{id}/preview`: a **real** Cosmos run of a user prompt on one clip (6.4 s) |
| `run.json` | `POST api/detectors/{id}/runs`, `GET api/runs/{id}`: illustrative, shape only |
| `media/thumbs/*.jpg` | `thumb_url` of every event |
| `media/hero/dashcam_*.jpg` | Clean frames from our own footage, for backgrounds |

The clips (`clip_url`) are not included because each one is about 6 MB. Get them from the live
backend through the SSH tunnel, or use any short mp4 while mocking.
