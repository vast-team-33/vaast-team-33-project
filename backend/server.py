#!/usr/bin/env python3
"""Crossing Risk backend: serves the API contract (api/openapi.yaml). Standard library only."""
import gzip
import json
import mimetypes
import os
import re
import threading
import time
import base64
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
LANE = [[806, 594], [1114, 594], [1440, 1004], [480, 1004]]
FRAME_W = 1920
CHOICES = ["driver_right", "model_right", "both_fine", "false_alarm"]
TARGETS = [
    {"id": "cosmos_transfer", "label": "NVIDIA Cosmos Transfer (video variations)"},
    {"id": "omniverse", "label": "NVIDIA Omniverse / Isaac Sim (3D re-simulation)"},
    {"id": "openscenario", "label": "OpenSCENARIO file (CARLA and other simulators)"},
]
VARIATIONS = ["same scene at night", "same scene in heavy rain", "pedestrian steps out 1 s later",
              "ego car 20% faster", "a child instead of an adult", "pedestrian partly hidden by a parked van"]
DEMO_MSG = "Demo mode: no simulator is connected. The scenario package is real; sending is simulated."
MODELS = {"detector": "yolo11s (COCO), stored per-frame boxes",
          "judge": "nvidia/cosmos3-nano-reasoner",
          "ego_speed": "optical flow (OpenCV Farneback), relative units"}
MAX_BODY = 2048
JUDGE_MODEL = "nvidia/cosmos3-nano-reasoner"
DEFAULT_COSMOS_URL = "http://166.19.38.112:8001/v1/chat/completions"
JUDGE_TIMEOUT = 120
JUDGE_PROMPT = ('You are a detector for a dashcam clip from a car (the ego car).\n'
                'Detector definition, written by a user: "%s"\n'
                'Answer with JSON only: {"match": true or false, "confidence": 0.0 to 1.0, '
                '"moment_sec": seconds into the clip where it is clearest or null, '
                '"reason": "one short sentence"}')
CLIP_RE = re.compile(r"^(\d{8}_\d{6})_(set\d+)_.*?chunk_(\d+)_segment_(\d+)_of_(\d+)$")
BUILTIN_ID = "crossing_risk"
ID_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class ApiError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


def judge_clip(clip_path, user_prompt):
    """Ask the Cosmos judge about one clip. Returns (result dict, latency_ms). Raises ApiError(502)."""
    url = os.environ.get("COSMOS_URL") or DEFAULT_COSMOS_URL
    token = os.environ.get("GPU_BEARER_TOKEN", "")
    try:
        with open(clip_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
    except OSError:
        raise ApiError(404, "not_found", "clip not found")
    payload = {"model": JUDGE_MODEL, "temperature": 0, "max_tokens": 200,
               "messages": [{"role": "user", "content": [
                   {"type": "text", "text": JUDGE_PROMPT % user_prompt},
                   {"type": "video_url", "video_url": {"url": "data:video/mp4;base64," + b64}}]}]}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json",
                                          "Authorization": "Bearer " + token})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=JUDGE_TIMEOUT) as resp:
            out = json.loads(resp.read().decode())
        text = out["choices"][0]["message"]["content"] or ""
    except Exception as e:  # noqa
        raise ApiError(502, "gpu_error", "judge call failed: %s" % type(e).__name__)
    latency = int((time.time() - t0) * 1000)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    a, b = text.find("{"), text.rfind("}")
    if a < 0 or b < a:
        raise ApiError(502, "gpu_error", "judge returned no JSON")
    try:
        raw = json.loads(text[a:b + 1])
        if not isinstance(raw, dict):
            raise ValueError
    except ValueError:
        raise ApiError(502, "gpu_error", "judge returned invalid JSON")
    try:
        conf = max(0.0, min(1.0, float(raw.get("confidence") or 0)))
    except (TypeError, ValueError):
        conf = 0.0
    m = raw.get("moment_sec")
    m = float(m) if isinstance(m, (int, float)) and not isinstance(m, bool) else None
    return {"match": raw.get("match") is True, "confidence": conf, "moment_sec": m,
            "reason": str(raw.get("reason") or "")[:300]}, latency


def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


class Store:
    def __init__(self, data_dir, feedback_file):
        self.data_dir = data_dir
        self.feedback_file = feedback_file
        self.lock = threading.Lock()
        self.raw = {}
        self.events = []
        self.by_id = {}
        self.feedback = []
        self.export_n = 0
        self.user_detectors = []
        self.det_events = []
        self.runs = {}
        self.run_n = 0
        self.load()

    def load(self):
        p = os.path.join(self.data_dir, "events.json")
        try:
            with open(p) as f:
                self.raw = json.load(f)
        except (OSError, ValueError):
            self.raw = {"scanned": 0, "in_zone": 0, "stop_threshold": 0.35, "events": []}
        self.feedback = []
        try:
            with open(self.feedback_file) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            self.feedback.append(json.loads(line))
                        except ValueError:
                            pass
        except OSError:
            pass
        self.events = [self.convert(e) for e in self.raw.get("events", [])]
        self.by_id = {e["id"]: e for e in self.events}
        self.user_detectors = self._load_json("detectors.json", [])
        self.det_events = self._load_json("detector_events.json", [])
        for e in self.det_events:
            self.by_id[e["id"]] = e

    def _load_json(self, name, default):
        try:
            with open(os.path.join(self.data_dir, name)) as f:
                v = json.load(f)
            return v if isinstance(v, list) else default
        except (OSError, ValueError):
            return default

    def _save_json(self, name, obj):
        p = os.path.join(self.data_dir, name)
        try:
            os.makedirs(self.data_dir, exist_ok=True)
            with open(p + ".tmp", "w") as f:
                json.dump(obj, f)
            os.replace(p + ".tmp", p)
        except OSError:
            pass

    @staticmethod
    def convert(e):
        eid = e["id"][:-4] if e["id"].endswith(".mp4") else e["id"]
        v = e.get("verdict") or {}
        return {
            "id": eid, "detector_id": "crossing_risk", "drive": e.get("drive", ""),
            "chunk": e.get("chunk", 0), "segment": e.get("segment", 0),
            "drive_time_sec": e.get("drive_time_sec", 0), "peak_sec": e.get("peak_sec", 0),
            "danger": e.get("danger", 0), "factors": e.get("factors", {}),
            "pedestrian_position": v.get("pedestrian_position") or "none",
            "crossing_location": v.get("crossing_location") or "unclear",
            "risk": v.get("risk") or "none", "reason": v.get("reason") or "",
            "actual_action": e.get("actual_action", "unknown"),
            "suggested_action": e.get("suggested_action", "unknown"),
            "agreement": e.get("agreement", "unknown"),
            "speeds": e.get("speeds", []), "suggested_speeds": e.get("suggested_speeds", []),
            "person_bbox": e.get("bbox", [0, 0, 0, 0]), "frame_w": FRAME_W,
            "frame_h": e.get("frame_h", 1080), "frames_in_lane": e.get("frames_in_zone", 0),
            "clip_url": "media/clips/%s.mp4" % eid, "thumb_url": "media/thumbs/%s.jpg" % eid,
        }

    def latest_feedback(self, eid):
        for fb in reversed(self.feedback):
            if fb["event_id"] == eid:
                return fb
        return None

    def event_view(self, e):
        d = dict(e)
        d["feedback"] = self.latest_feedback(e["id"])
        return d

    def add_feedback(self, eid, choice, note):
        with self.lock:
            fb = {"id": "fb_%04d" % (len(self.feedback) + 1), "event_id": eid, "choice": choice,
                  "created_at": now_iso()}
            if note:
                fb["note"] = note
            os.makedirs(os.path.dirname(os.path.abspath(self.feedback_file)), exist_ok=True)
            with open(self.feedback_file, "a") as f:
                f.write(json.dumps(fb) + "\n")
            self.feedback.append(fb)
            return fb

    def next_export(self):
        with self.lock:
            self.export_n += 1
            return self.export_n

    def detections(self, eid):
        p = os.path.join(self.data_dir, "sidecars", eid + ".json.gz")
        if not os.path.isfile(p):
            return None
        try:
            with gzip.open(p, "rt") as f:
                raw = json.load(f)
        except (OSError, ValueError):
            return None
        shape = raw.get("video_shape") or [1080, 1920]
        frames = []
        for i, fr in enumerate(raw.get("frames", [])):
            if i % 3:
                continue
            boxes = []
            for d in fr.get("detections", []):
                if d.get("confidence", 0) < 0.3:
                    continue
                x1, y1, x2, y2 = [int(round(v)) for v in d["bbox"]]
                inl = d.get("label") == "person" and point_in_poly((x1 + x2) / 2, y2, LANE)
                boxes.append({"label": d["label"], "confidence": round(d["confidence"], 3),
                              "bbox": [x1, y1, x2, y2], "in_lane": bool(inl)})
            frames.append({"t": round(fr.get("time_sec", 0), 1), "boxes": boxes})
        return {"event_id": eid, "fps": 10, "frame_w": shape[1], "frame_h": shape[0],
                "lane_polygon": LANE, "frames": frames}

    def summary(self):
        def count(key):
            out = {}
            for e in self.events:
                out[e[key]] = out.get(e[key], 0) + 1
            return out
        return {"generated_at": now_iso(), "source": "Toronto dashcam (pie_cam-3), 6 drives",
                "clips_scanned": self.raw.get("scanned", 0), "candidates": self.raw.get("in_zone", 0),
                "events": len(self.events), "by_agreement": count("agreement"),
                "by_crossing": count("crossing_location"), "by_risk": count("risk"),
                "feedback_count": len(self.feedback), "models": MODELS}

    def config(self):
        return {"frame_w": FRAME_W, "frame_h": 1080, "lane_polygon": LANE, "speed_sample_sec": 0.2,
                "stop_threshold": self.raw.get("stop_threshold", 0.35),
                "score": {"formula": "100 * closeness^0.7 * (0.6 + 0.4 * exposure) * location * moving",
                          "location_weights": {"on_road": 1.0, "on_crosswalk": 0.6,
                                               "on_sidewalk_or_curb": 0.15, "none": 0.05},
                          "moving_weights": {"moving": 1.0, "stopped": 0.35}},
                "feedback_choices": CHOICES}

    def builtin_detector(self):
        return {
            "id": BUILTIN_ID, "name": "Pedestrian in the car's path", "kind": "builtin",
            "prompt": "A pedestrian is on the road ahead of the ego car; is it at a marked crosswalk or outside one, is the car moving, how risky is it, and what should the car do?",
            "description": "Built-in detector: YOLO person in the lane zone, judged by Cosmos3-Reason, scored 0-100.",
            "prefilter": {"object_class": "person", "in_lane": True}, "status": "active",
            "created_at": now_iso(), "last_run_id": None, "event_count": len(self.events)}

    def detector_view(self, d):
        v = dict(d)
        v["event_count"] = sum(1 for e in self.det_events if e["detector_id"] == d["id"])
        return v

    def detectors(self):
        with self.lock:
            return {"items": [self.builtin_detector()] + [self.detector_view(d) for d in self.user_detectors]}

    def get_detector(self, did):
        if did == BUILTIN_ID:
            return self.builtin_detector()
        with self.lock:
            for d in self.user_detectors:
                if d["id"] == did:
                    return self.detector_view(d)
        raise ApiError(404, "not_found", "detector not found: %s" % did)

    def create_detector(self, body):
        def text(key, maxlen, required):
            v = body.get(key)
            if v is None and not required:
                return ""
            if not isinstance(v, str) or (required and not v.strip()):
                raise ApiError(400, "bad_request", "%s must be a non-empty string" % key if required
                               else "%s must be a string" % key)
            if len(v) > maxlen:
                raise ApiError(400, "bad_request", "%s must be at most %d characters" % (key, maxlen))
            return v
        name = text("name", 80, True)
        prompt = text("prompt", 800, True)
        desc = text("description", 300, False)
        pf_in = body.get("prefilter")
        pf = {}
        if pf_in is not None:
            if not isinstance(pf_in, dict):
                raise ApiError(400, "bad_request", "prefilter must be an object")
            oc = pf_in.get("object_class")
            if oc is not None:
                if not isinstance(oc, str) or not oc.strip() or len(oc) > 40:
                    raise ApiError(400, "bad_request", "prefilter.object_class must be a short string")
                pf["object_class"] = oc.strip()
            il = pf_in.get("in_lane")
            if il is not None:
                if not isinstance(il, bool):
                    raise ApiError(400, "bad_request", "prefilter.in_lane must be a boolean")
                pf["in_lane"] = il
        with self.lock:
            nums = [int(d["id"][4:]) for d in self.user_detectors if d["id"][4:].isdigit()]
            nid = "det_%04d" % (max(nums + [0]) + 1)
            d = {"id": nid, "name": name, "kind": "user", "prompt": prompt, "description": desc,
                 "prefilter": pf, "status": "draft", "created_at": now_iso(), "last_run_id": None,
                 "event_count": 0}
            self.user_detectors.append(d)
            self._save_json("detectors.json", self.user_detectors)
            return dict(d)

    def set_detector(self, did, **kw):
        with self.lock:
            for d in self.user_detectors:
                if d["id"] == did:
                    d.update(kw)
                    self._save_json("detectors.json", self.user_detectors)

    # --- clips, preview, runs
    def clip_ids(self):
        d = os.path.join(self.data_dir, "clips")
        try:
            return sorted(n[:-4] for n in os.listdir(d) if n.endswith(".mp4") and ID_RE.match(n))
        except OSError:
            return []

    def clip_path(self, cid):
        return os.path.join(self.data_dir, "clips", cid + ".mp4")

    def preview(self, did, event_id):
        det = self.get_detector(did)
        if event_id is not None:
            if not isinstance(event_id, str) or not ID_RE.match(event_id):
                raise ApiError(400, "bad_request", "event_id must be a string")
            cid = event_id[:-4] if event_id.endswith(".mp4") else event_id
            src = self.by_id.get(event_id)
            if src:
                cid = src["id"].split("__")[0]
            if not os.path.isfile(self.clip_path(cid)):
                raise ApiError(404, "not_found", "no clip for event: %s" % event_id)
        else:
            ids = self.clip_ids()
            if not ids:
                raise ApiError(404, "not_found", "no clips available")
            cid = ids[0]
        result, latency = judge_clip(self.clip_path(cid), det["prompt"])
        if det["kind"] == "user":
            self.set_detector(did, status="tested")
        return {"detector_id": did, "sample_event_id": cid, "result": result,
                "latency_ms": latency, "model": JUDGE_MODEL}

    def source_event(self, cid):
        e = self.by_id.get(cid)
        if e and e.get("detector_id") == BUILTIN_ID:
            return e
        m = CLIP_RE.match(cid)
        drive = m.group(2) if m else ""
        chunk = int(m.group(3)) if m else 0
        seg = int(m.group(4)) if m else 0
        return {"id": cid, "drive": drive, "chunk": chunk, "segment": seg,
                "drive_time_sec": chunk * 30 + max(seg - 1, 0) * 5, "peak_sec": 0,
                "frame_w": FRAME_W, "frame_h": 1080,
                "clip_url": "media/clips/%s.mp4" % cid, "thumb_url": "media/thumbs/%s.jpg" % cid}

    def prefilter_ok(self, cid, pf):
        oc = pf.get("object_class")
        if not oc:
            return True
        p = os.path.join(self.data_dir, "sidecars", cid + ".json.gz")
        try:
            with gzip.open(p, "rt") as f:
                raw = json.load(f)
        except (OSError, ValueError):
            return False
        for fr in raw.get("frames", []):
            for d in fr.get("detections", []):
                if d.get("label") != oc or d.get("confidence", 0) < 0.3:
                    continue
                if pf.get("in_lane"):
                    x1, y1, x2, y2 = d["bbox"]
                    if not point_in_poly((x1 + x2) / 2, y2, LANE):
                        continue
                return True
        return False

    def start_run(self, did, body):
        det = self.get_detector(did)
        drives = body.get("drives")
        if drives is not None and (not isinstance(drives, list) or not all(isinstance(x, str) for x in drives)):
            raise ApiError(400, "bad_request", "drives must be an array of strings")
        mc = body.get("max_clips", 50)
        if isinstance(mc, bool) or not isinstance(mc, int) or mc < 1:
            raise ApiError(400, "bad_request", "max_clips must be a positive integer")
        mc = min(mc, 200)
        with self.lock:
            for r in self.runs.values():
                if r["detector_id"] == did and r["status"] in ("queued", "running"):
                    raise ApiError(409, "conflict", "a run of this detector is already in progress")
            self.run_n += 1
            run = {"run_id": "run_%04d" % self.run_n, "detector_id": did, "status": "running",
                   "progress": {"done": 0, "total": 0}, "matched": 0, "started_at": now_iso(),
                   "finished_at": None, "estimated_seconds": 0}
            self.runs[run["run_id"]] = run
        if det["kind"] == "user":
            self.set_detector(did, status="running", last_run_id=run["run_id"])
        threading.Thread(target=self._run_worker, args=(run, det, drives, mc), daemon=True).start()
        with self.lock:
            return json.loads(json.dumps(run))

    def get_run(self, rid):
        with self.lock:
            r = self.runs.get(rid)
            if not r:
                raise ApiError(404, "not_found", "run not found: %s" % rid)
            return json.loads(json.dumps(r))

    def _run_worker(self, run, det, drives, max_clips):
        errors = []
        try:
            cands = []
            for cid in self.clip_ids():
                src = self.source_event(cid)
                if drives and src["drive"] not in drives:
                    continue
                if self.prefilter_ok(cid, det.get("prefilter") or {}):
                    cands.append(src)
                    if len(cands) >= max_clips:
                        break
            with self.lock:
                run["progress"]["total"] = len(cands)
                run["estimated_seconds"] = len(cands) * 3

            def one(src):
                try:
                    res, _ = judge_clip(self.clip_path(src["id"]), det["prompt"])
                    if res["match"]:
                        ev = self.make_event(det["id"], src, res)
                        with self.lock:
                            self.det_events.append(ev)
                            self.by_id[ev["id"]] = ev
                            self._save_json("detector_events.json", self.det_events)
                            run["matched"] += 1
                except Exception as e:  # noqa
                    errors.append(str(getattr(e, "message", e)))
                finally:
                    with self.lock:
                        run["progress"]["done"] += 1
            with ThreadPoolExecutor(max_workers=2) as ex:
                list(ex.map(one, cands))
            failed = bool(cands) and len(errors) == len(cands)
            with self.lock:
                run["status"] = "failed" if failed else "completed"
                if failed:
                    run["error"] = errors[0]
        except Exception as e:  # noqa
            with self.lock:
                run["status"] = "failed"
                run["error"] = str(e)
        with self.lock:
            run["finished_at"] = now_iso()
            ok = run["status"] == "completed"
        if det["kind"] == "user":
            self.set_detector(det["id"], status="active" if ok else "failed")

    @staticmethod
    def make_event(did, src, res):
        return {
            "id": "%s__%s" % (src["id"], did), "detector_id": did, "drive": src["drive"],
            "chunk": src["chunk"], "segment": src["segment"], "drive_time_sec": src["drive_time_sec"],
            "peak_sec": res["moment_sec"] if res["moment_sec"] is not None else 0,
            "danger": int(round(res["confidence"] * 100)),
            "factors": {"closeness": 0, "exposure": 0, "location": 0, "moving": 0},
            "pedestrian_position": "none", "crossing_location": "unclear", "risk": "none",
            "reason": res["reason"], "actual_action": "unknown", "suggested_action": "unknown",
            "agreement": "unknown", "speeds": [], "suggested_speeds": [], "person_bbox": [0, 0, 0, 0],
            "frame_w": FRAME_W, "frame_h": src.get("frame_h", 1080), "frames_in_lane": 0,
            "clip_url": src["clip_url"], "thumb_url": src["thumb_url"]}

    def scenario(self, e):
        eid = e["id"]
        track = []
        det = self.detections(eid)
        if det:
            for fr in det["frames"]:
                cands = [b for b in fr["boxes"] if b["label"] == "person" and b["in_lane"]]
                if cands:
                    b = max(cands, key=lambda b: b["bbox"][3] - b["bbox"][1])
                    track.append({"t": fr["t"], "bbox": b["bbox"]})
        if not track:
            track = [{"t": e["peak_sec"], "bbox": e["person_bbox"]}]
        cross = e["crossing_location"].replace("_", " ")
        pos = e["pedestrian_position"].replace("_", " ")
        act = e["actual_action"].replace("_", " ")
        sug = e["suggested_action"].replace("_", " ")
        summary = "Pedestrian %s ahead of the ego car (%s); driver %s, model suggests %s." % (pos, cross, act, sug)
        where = ("at a marked crosswalk" if e["crossing_location"] == "marked_crosswalk"
                 else "outside any marked crosswalk" if e["crossing_location"] == "outside_crosswalk"
                 else "near the road")
        prompt = ("Dashcam view from a car driving on an urban Toronto street in daylight. A pedestrian "
                  "is on the road ahead %s while the car approaches. Keep the street layout, parked cars "
                  "and buildings; vary lighting, weather and timing." % where)
        return {"scenario_id": "scn_" + eid, "source_event_id": eid, "format": "crossing-risk-scenario/v0",
                "summary": summary, "danger": e["danger"],
                "ego": {"actual_action": e["actual_action"], "suggested_action": e["suggested_action"],
                        "speed_sample_sec": 0.2, "speed_profile_rel": e["speeds"],
                        "suggested_speed_profile_rel": e["suggested_speeds"]},
                "actors": [{"type": "pedestrian", "position": e["pedestrian_position"],
                            "crossing_location": e["crossing_location"], "image_track": track}],
                "environment": {"city": "Toronto", "road": "urban street", "time_of_day": "day",
                                "weather": "unknown"},
                "variations": VARIATIONS, "generation_prompt": prompt, "targets": TARGETS}


def to_int(q, name, default, lo=None, hi=None):
    vals = q.get(name)
    if not vals or vals[0] == "":
        return default
    try:
        n = int(vals[0])
    except ValueError:
        raise ApiError(400, "bad_request", "%s must be an integer" % name)
    if lo is not None:
        n = max(lo, n)
    if hi is not None:
        n = min(hi, n)
    return n


def list_events(store, q):
    def one(name):
        v = q.get(name)
        return v[0] if v and v[0] != "" else None
    did = one("detector_id")
    if did is None or did == BUILTIN_ID:
        items = list(store.events)
    else:
        items = [e for e in store.det_events if e["detector_id"] == did]
    md = to_int(q, "min_danger", None)
    if md is not None:
        items = [e for e in items if e["danger"] >= md]
    for key, qn in (("agreement", "agreement"), ("crossing_location", "crossing"),
                    ("pedestrian_position", "position"), ("drive", "drive")):
        v = one(qn)
        if v is not None:
            items = [e for e in items if e[key] == v]
    hf = one("has_feedback")
    if hf is not None:
        want = hf.lower() in ("1", "true", "yes")
        items = [e for e in items if (store.latest_feedback(e["id"]) is not None) == want]
    sort = one("sort") or "danger_desc"
    if sort == "danger_desc":
        items.sort(key=lambda e: (-e["danger"], e["drive"], e["drive_time_sec"]))
    elif sort == "drive_time_asc":
        items.sort(key=lambda e: (e["drive"], e["drive_time_sec"]))
    else:
        raise ApiError(400, "bad_request", "sort must be danger_desc or drive_time_asc")
    limit = to_int(q, "limit", 50, 0, 200)
    offset = to_int(q, "offset", 0, 0)
    return {"total": len(items), "limit": limit, "offset": offset,
            "items": [store.event_view(e) for e in items[offset:offset + limit]]}


class Handler(BaseHTTPRequestHandler):
    server_version = "CrossingRisk/0.1"
    protocol_version = "HTTP/1.1"
    store = None
    static_dir = None
    data_dir = None

    def log_message(self, fmt, *args):
        pass

    # --- plumbing
    def send_json(self, status, obj, api_get=False):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if api_get:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_error_json(self, status, code, message):
        self.send_json(status, {"error": {"code": code, "message": message}},
                       api_get=self.path.startswith("/api"))

    def read_json(self, optional=False):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError(400, "bad_request", "bad Content-Length")
        if length > MAX_BODY:
            self.close_connection = True
            raise ApiError(413, "payload_too_large", "body must be at most 2 KB")
        raw = self.rfile.read(length) if length else b""
        if optional and not raw.strip():
            return {}
        try:
            obj = json.loads(raw.decode() or "null")
        except ValueError:
            raise ApiError(400, "bad_request", "body must be valid JSON")
        if not isinstance(obj, dict):
            raise ApiError(400, "bad_request", "body must be a JSON object")
        return obj

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        try:
            u = urlparse(self.path)
            path = u.path
            if path.startswith("/api/") or path == "/api":
                self.api_get(path, parse_qs(u.query))
            elif path.startswith("/media/"):
                self.media(path)
            else:
                self.static(path)
        except ApiError as e:
            self.send_error_json(e.status, e.code, e.message)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa
            self.send_error_json(500, "internal", str(e))

    def do_POST(self):
        try:
            path = urlparse(self.path).path
            if not path.startswith("/api/"):
                raise ApiError(404, "not_found", "unknown route")
            self.api_post(path)
        except ApiError as e:
            self.send_error_json(e.status, e.code, e.message)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa
            self.send_error_json(500, "internal", str(e))

    def get_event(self, eid):
        e = self.store.by_id.get(eid)
        if not e:
            raise ApiError(404, "not_found", "event not found: %s" % eid)
        return e

    # --- API
    def api_get(self, path, q):
        s = self.store
        parts = path.split("/")[2:]  # after /api
        out = lambda o: self.send_json(200, o, api_get=True)
        if parts == ["health"]:
            return out({"ok": True})
        if parts == ["summary"]:
            return out(s.summary())
        if parts == ["config"]:
            return out(s.config())
        if parts == ["events"]:
            return out(list_events(s, q))
        if len(parts) == 2 and parts[0] == "events":
            return out(s.event_view(self.get_event(unquote(parts[1]))))
        if len(parts) == 3 and parts[0] == "events":
            e = self.get_event(unquote(parts[1]))
            if parts[2] == "detections":
                d = s.detections(e["id"])
                if d is None:
                    raise ApiError(404, "not_found", "no detections for this event")
                return out(d)
            if parts[2] == "scenario":
                return out(s.scenario(e))
        if parts == ["feedback"]:
            eid = (q.get("event_id") or [None])[0]
            items = [f for f in reversed(s.feedback) if not eid or f["event_id"] == eid]
            return out({"items": items})
        if parts == ["detectors"]:
            return out(s.detectors())
        if len(parts) == 2 and parts[0] == "detectors":
            return out(s.get_detector(unquote(parts[1])))
        if len(parts) == 2 and parts[0] == "runs":
            return out(s.get_run(unquote(parts[1])))
        raise ApiError(404, "not_found", "unknown route")

    def api_post(self, path):
        s = self.store
        parts = path.split("/")[2:]
        if len(parts) == 3 and parts[0] == "events" and parts[2] in ("feedback", "export"):
            e = self.get_event(unquote(parts[1]))
            body = self.read_json()
            if parts[2] == "feedback":
                choice = body.get("choice")
                if choice not in CHOICES:
                    raise ApiError(400, "bad_request", "choice must be one of: " + ", ".join(CHOICES))
                note = body.get("note", "")
                if note is None:
                    note = ""
                if not isinstance(note, str) or len(note) > 500:
                    raise ApiError(400, "bad_request", "note must be a string of at most 500 characters")
                return self.send_json(201, s.add_feedback(e["id"], choice, note))
            target = body.get("target")
            if target not in [t["id"] for t in TARGETS]:
                raise ApiError(400, "bad_request", "target must be one of: cosmos_transfer, omniverse, openscenario")
            return self.send_json(202, {"export_id": "exp_%04d" % s.next_export(), "event_id": e["id"],
                                        "target": target, "status": "queued", "demo": True,
                                        "message": DEMO_MSG, "created_at": now_iso()})
        if parts == ["detectors"]:
            return self.send_json(201, s.create_detector(self.read_json()))
        if len(parts) == 3 and parts[0] == "detectors":
            did = unquote(parts[1])
            if parts[2] == "preview":
                s.get_detector(did)
                body = self.read_json(optional=True)
                return self.send_json(200, s.preview(did, body.get("event_id")))
            if parts[2] == "runs":
                s.get_detector(did)
                return self.send_json(202, s.start_run(did, self.read_json(optional=True)))
            if parts[2] == "export":
                s.get_detector(did)
                body = self.read_json()
                target = body.get("target")
                if target not in [t["id"] for t in TARGETS]:
                    raise ApiError(400, "bad_request", "target must be one of: cosmos_transfer, omniverse, openscenario")
                md = body.get("min_danger")
                if md is not None and (isinstance(md, bool) or not isinstance(md, int)):
                    raise ApiError(400, "bad_request", "min_danger must be an integer")
                return self.send_json(202, {"export_id": "exp_%04d" % s.next_export(), "event_id": did,
                                            "target": target, "status": "queued", "demo": True,
                                            "message": DEMO_MSG, "created_at": now_iso()})
        raise ApiError(404, "not_found", "unknown route")

    # --- files
    def media(self, path):
        rel = unquote(path[len("/media/"):])
        kind, _, name = rel.partition("/")
        ext = {"clips": ".mp4", "thumbs": ".jpg", "hero": None}.get(kind, "x")
        if ext == "x" or not name or ".." in name or not ID_RE.match(name) or (ext and not name.endswith(ext)):
            raise ApiError(404, "not_found", "media not found")
        fp = os.path.join(self.data_dir, kind, name)
        if not os.path.isfile(fp):
            raise ApiError(404, "not_found", "media not found")
        self.send_file(fp, ranges=True)

    def static(self, path):
        root = self.static_dir
        if not root or not os.path.isdir(root):
            if path in ("/", "/index.html"):
                body = b"<!doctype html><title>Crossing Risk</title><p>Frontend is not built yet. The API is under /api.</p>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(body)
                return
            raise ApiError(404, "not_found", "not found")
        rel = unquote(path).lstrip("/") or "index.html"
        fp = os.path.realpath(os.path.join(root, rel))
        rr = os.path.realpath(root)
        if not (fp == rr or fp.startswith(rr + os.sep)):
            raise ApiError(404, "not_found", "not found")
        if os.path.isdir(fp):
            fp = os.path.join(fp, "index.html")
        if not os.path.isfile(fp):
            raise ApiError(404, "not_found", "not found")
        self.send_file(fp, ranges=False)

    def send_file(self, fp, ranges):
        size = os.path.getsize(fp)
        ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        start, end, status = 0, size - 1, 200
        rng = self.headers.get("Range") if ranges else None
        if rng:
            m = re.match(r"^bytes=(\d*)-(\d*)$", rng.strip())
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else size - 1
                else:
                    start = max(0, size - int(m.group(2)))
                end = min(end, size - 1)
                if start >= size or start > end:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % size)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = 206
        length = end - start + 1 if size else 0
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        if ranges:
            self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.end_headers()
        if self.command == "HEAD":
            return
        with open(fp, "rb") as f:
            f.seek(start)
            left = length
            while left > 0:
                chunk = f.read(min(65536, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)


def make_server(host, port, data_dir, static_dir, feedback_file=None):
    data_dir = os.path.abspath(data_dir)
    feedback_file = feedback_file or os.path.join(data_dir, "feedback.jsonl")

    class H(Handler):
        pass
    H.store = Store(data_dir, feedback_file)
    H.static_dir = static_dir
    H.data_dir = data_dir
    srv = ThreadingHTTPServer((host, port), H)
    srv.daemon_threads = True
    return srv


def main():
    data_dir = os.environ.get("DATA_DIR", "./data")
    static_dir = os.environ.get("STATIC_DIR", os.path.join(HERE, "..", "frontend", "dist"))
    srv = make_server(os.environ.get("HOST", "0.0.0.0"), int(os.environ.get("PORT", "8080")),
                      data_dir, static_dir, os.environ.get("FEEDBACK_FILE"))
    print("listening on %s:%s data=%s" % (srv.server_address[0], srv.server_address[1], data_dir), flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
