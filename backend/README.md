# Backend

Standard-library Python 3.12 server for the API in `api/openapi.yaml` (boto3 is not needed).

## Environment

| Var | Default |
|---|---|
| `HOST` | `0.0.0.0` |
| `PORT` | `8080` |
| `DATA_DIR` | `./data` |
| `STATIC_DIR` | `../frontend/dist` (relative to `server.py`) |
| `FEEDBACK_FILE` | `$DATA_DIR/feedback.jsonl` |

## Data layout (`DATA_DIR`)

- `events.json`: pipeline output (`scanned`, `in_zone`, `stop_threshold`, `events[]`), mapped to the contract `Event`.
- `clips/<id>.mp4` served at `/media/clips/<id>.mp4` (HTTP Range supported).
- `thumbs/<id>.jpg` at `/media/thumbs/<id>.jpg`; `hero/*.jpg` at `/media/hero/...`.
- `sidecars/<id>.json.gz`: raw YOLO boxes, used for `/api/events/{id}/detections` and the scenario `image_track`.
- `feedback.jsonl`: appended by `POST /api/events/{id}/feedback`.

Detector routes other than `GET /api/detectors` answer 501 `not_implemented`.

## Run

    DATA_DIR=/path/to/data python backend/server.py

## Test

    cd backend && python -m unittest -v test_server
