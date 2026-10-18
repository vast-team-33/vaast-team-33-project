#!/usr/bin/env python3
"""Build the static archive for the archived demo (GitHub Pages, no backend). Standard library only.

Starts backend/server.py in-process on a snapshot DATA_DIR, saves every GET response the UI needs
under archive/api/ (same paths the client asks for, plus .json), saves the demo export answers,
and copies only the media those answers reference into archive/media/. Nothing in the snapshot
is written to: excluded events are filtered in a temporary copy of events.json.

The archive is public, so media is copied from the blurred copy (faces and number plates, made by
scripts/blur_media.py), never from the raw snapshot. A referenced file missing there stops the build.
The manifest (api/archive.json) also names the original PIE video and time range of each clip.

    python3 scripts/build_archive.py                      # data/demo-snapshot -> archive/
    python3 scripts/build_archive.py --exclude ID1,ID2    # leave more events out
    python3 scripts/build_archive.py --no-default-exclude # keep the events in DEFAULT_EXCLUDE too
"""
import argparse
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request

from pie_clips import CLIP_SEC, PIE as PIE_CLIPS, TIMES as PIE_TIMES

ROOT =os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = 200  # the server caps ?limit at 200
TARGETS = ["cosmos_transfer", "omniverse", "openscenario"]
MANIFEST_FORMAT = "drive-loop-archive/v1"

# Left out by default, as in the final live version. Ids as the API returns them (no .mp4).
DEFAULT_EXCLUDE = [
    "20261001_061655_set01_video_chunk_0027_segment_003_of_006",  # a cyclist, not a pedestrian (this one has video)
    "20261001_070258_set05_video_chunk_0012_segment_002_of_006",  # a cyclist, not a pedestrian
    "20261001_062925_set02_video_chunk_0026_segment_001_of_006",  # same moment as ..._0025_segment_006 (chunk boundary)
    "20261001_063353_set03_video_chunk_0005_segment_001_of_006",  # same moment as ..._0004_segment_006 (chunk boundary)
]
DEFAULT_EXCLUDE_NOTE = "Cyclists and duplicate clips were removed, as in the final live version."


def load_server():
    spec = importlib.util.spec_from_file_location("archive_backend", os.path.join(ROOT, "backend", "server.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Client:
    def __init__(self, base):
        self.base = base

    def call(self, method, path, params=None, body=None):
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method,
                                     headers={"Content-Type": "application/json"} if data else {})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            return e.code, None

    def get(self, path, params=None):
        status, obj = self.call("GET", path, params)
        if status != 200:
            raise SystemExit("GET %s failed with %s" % (path, status))
        return obj

    def all_events(self, params=None):
        """Every event in one page: walk the server's pages (limit is capped at 200)."""
        items, offset = [], 0
        while True:
            page = self.get("/api/events", dict(params or {}, limit=PAGE, offset=offset))
            items += page["items"]
            offset += len(page["items"])
            if not page["items"] or offset >= page["total"]:
                return {"total": page["total"], "limit": len(items), "offset": 0, "items": items}


def staged_data_dir(src, exclude, tmp):
    """A throwaway DATA_DIR: filtered events.json, the media folders linked read-only from the snapshot."""
    with open(os.path.join(src, "events.json")) as f:
        raw = json.load(f)
    strip = lambda i: i[:-4] if i.endswith(".mp4") else i
    known = {strip(e["id"]) for e in raw.get("events", [])}
    missing = sorted(exclude - known)
    if missing:
        print("warning: --exclude ids not in the snapshot: %s" % ", ".join(missing), file=sys.stderr)
    raw["events"] = [e for e in raw.get("events", []) if strip(e["id"]) not in exclude]
    dst = os.path.join(tmp, "data")
    os.makedirs(dst)
    with open(os.path.join(dst, "events.json"), "w") as f:
        json.dump(raw, f)
    for name in ("thumbs", "clips", "sidecars", "hero"):
        if os.path.isdir(os.path.join(src, name)):
            os.symlink(os.path.join(src, name), os.path.join(dst, name))
    for name in ("detectors.json", "detector_events.json"):
        p = os.path.join(src, name)
        if not os.path.isfile(p):
            continue
        with open(p) as f:
            rows = json.load(f)
        if name == "detector_events.json" and isinstance(rows, list):
            rows = [r for r in rows if r.get("id", "").split("__")[0] not in exclude]
        with open(os.path.join(dst, name), "w") as f:
            json.dump(rows, f)
    return dst


def collect(c, captured_at):
    """Fetch everything the UI reads. Returns {relative path under archive/api: object}."""
    out = {}
    summary = c.get("/api/summary")
    summary["generated_at"] = captured_at  # the numbers describe the snapshot, not the build time
    out["summary.json"] = summary
    out["config.json"] = c.get("/api/config")
    events = c.all_events()
    out["events.json"] = events

    detectors = c.get("/api/detectors")
    for d in detectors["items"]:
        if d["kind"] == "builtin":
            d["created_at"] = captured_at  # the server stamps the built-in detector with "now"
    out["detectors.json"] = detectors
    event_ids = [e["id"] for e in events["items"]]
    for d in detectors["items"]:
        did = d["id"]
        one = c.get("/api/detectors/" + urllib.parse.quote(did, safe=""))
        if one["kind"] == "builtin":
            one["created_at"] = captured_at
        out["detectors/%s.json" % did] = one
        page = c.all_events({"detector_id": did})
        out["detectors/%s/events.json" % did] = page
        event_ids += [e["id"] for e in page["items"] if e["id"] not in event_ids]

    with_detections = []
    for eid in event_ids:
        q = urllib.parse.quote(eid, safe="")
        out["events/%s.json" % eid] = c.get("/api/events/" + q)
        status, det = c.call("GET", "/api/events/%s/detections" % q)
        if status == 200:
            out["events/%s/detections.json" % eid] = det
            with_detections.append(eid)
        elif status != 404:
            raise SystemExit("GET detections for %s failed with %s" % (eid, status))
        out["events/%s/scenario.json" % eid] = c.get("/api/events/%s/scenario" % q)
        exports = {}
        for t in TARGETS:
            status, res = c.call("POST", "/api/events/%s/export" % q, body={"target": t})
            if status != 202:
                raise SystemExit("POST export for %s failed with %s" % (eid, status))
            res["created_at"] = captured_at
            exports[t] = res
        out["events/%s/export.json" % eid] = exports
    return out, event_ids, with_detections


def walk_events(obj):
    """Yield every event-shaped dict (has clip_url and thumb_url) inside the dumped responses."""
    if isinstance(obj, dict):
        if "clip_url" in obj and "thumb_url" in obj:
            yield obj
        for v in obj.values():
            yield from walk_events(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk_events(v)


def media_source(data_dir, rel):
    """'media/clips/x.mp4' -> <data_dir>/clips/x.mp4 (same mapping as the server's /media handler)."""
    if not rel or not rel.startswith("media/") or ".." in rel:
        return None
    return os.path.join(data_dir, rel[len("media/"):])


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return ("%d %s" % (n, unit)) if unit == "B" else ("%.1f %s" % (n, unit))
        n /= 1024.0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=os.path.join(ROOT, "data", "demo-snapshot"), help="snapshot DATA_DIR (read only)")
    ap.add_argument("--media", default=os.path.join(ROOT, "data", "demo-media-blurred"),
                    help="blurred media (clips/, thumbs/) made by scripts/blur_media.py; the only media source")
    ap.add_argument("--out", default=os.path.join(ROOT, "archive"), help="output folder (replaced)")
    ap.add_argument("--exclude", default="", help="comma-separated event ids to leave out, on top of DEFAULT_EXCLUDE")
    ap.add_argument("--no-default-exclude", action="store_true", help="do not leave out the events in DEFAULT_EXCLUDE")
    ap.add_argument("--captured-at", default="2026-10-17T13:16:00Z",
                    help="when the snapshot was taken (UTC); used for timestamps the server would set to now")
    ap.add_argument("--captured-label", default="17 Oct, 14:16 BST", help="the same time, as people read it")
    args = ap.parse_args()

    data = os.path.abspath(args.data)
    out_dir = os.path.abspath(args.out)
    if not os.path.isfile(os.path.join(data, "events.json")):
        raise SystemExit("no events.json in %s" % data)
    if os.path.exists(out_dir) and os.listdir(out_dir) and not os.path.isfile(os.path.join(out_dir, "api", "archive.json")):
        raise SystemExit("%s exists and is not an archive built by this script; refusing to replace it" % out_dir)
    extra = [x.strip() for x in args.exclude.split(",") if x.strip()]
    exclude = {x[:-4] if x.endswith(".mp4") else x for x in extra + ([] if args.no_default_exclude else DEFAULT_EXCLUDE)}

    server = load_server()
    with tempfile.TemporaryDirectory(prefix="archive-") as tmp:
        staged = staged_data_dir(data, exclude, tmp)
        srv = server.make_server("127.0.0.1", 0, staged, None, os.path.join(tmp, "feedback.jsonl"))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            files, event_ids, with_detections = collect(Client("http://127.0.0.1:%d" % srv.server_address[1]),
                                                        args.captured_at)
        finally:
            srv.shutdown()
            srv.server_close()

    # Media: copy only what the answers reference. A missing clip becomes clip_url null, which the
    # archive UI shows as the thumbnail plus "Video not included in this archive."
    media, missing = {}, {"clips": set(), "thumbs": set()}
    for path, obj in files.items():
        for ev in walk_events(obj):
            for key, kind in (("clip_url", "clips"), ("thumb_url", "thumbs")):
                rel = ev.get(key)
                src = media_source(data, rel)
                if src and os.path.isfile(src):
                    media[rel] = src
                elif rel is not None:
                    missing[kind].add(ev.get("id") or ev.get("source_event_id") or path)
                    ev[key] = None
    blurred = {rel: media_source(os.path.abspath(args.media), rel) for rel in media}
    unblurred = sorted(rel for rel, src in blurred.items() if not os.path.isfile(src))
    if unblurred:
        raise SystemExit("no blurred copy in %s for:\n  %s\nrun scripts/blur_media.py first"
                         % (args.media, "\n  ".join(unblurred)))
    media = blurred
    with_video = sorted(e for e in event_ids if (files["events/%s.json" % e].get("clip_url")))
    main_ids = [e["id"] for e in files["events.json"]["items"]]
    # The public PIE video and time range each clip was cut from (scripts/pie_clips.py), shown on the event page
    pie = json.load(open(PIE_TIMES))
    sources = {e: {"dataset": "PIE", "file": pie[e]["file"], "start_sec": pie[e]["start_sec"],
                   "end_sec": round(pie[e]["start_sec"] + CLIP_SEC, 2), "url": "%s/%s" % (PIE_CLIPS, pie[e]["file"])}
               for e in with_video if e in pie}

    files["archive.json"] = {
        "format": MANIFEST_FORMAT, "captured_at": args.captured_at, "captured_label": args.captured_label,
        "events": len(main_ids), "events_with_video": sum(1 for e in main_ids if e in with_video),
        "detectors": len(files["detectors.json"]["items"]), "with_video": with_video,
        "with_detections": sorted(with_detections), "excluded": sorted(exclude),
        "note": "" if args.no_default_exclude else DEFAULT_EXCLUDE_NOTE, "sources": sources,
    }

    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    total, n_json = 0, 0
    for rel, obj in sorted(files.items()):
        p = os.path.join(out_dir, "api", rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
            f.write("\n")
        total += os.path.getsize(p)
        n_json += 1
    media_bytes = {"clips": 0, "thumbs": 0}
    counts = {"clips": 0, "thumbs": 0}
    for rel, src in sorted(media.items()):
        dst = os.path.join(out_dir, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)
        kind = rel.split("/")[1]
        size = os.path.getsize(dst)
        media_bytes[kind] = media_bytes.get(kind, 0) + size
        counts[kind] = counts.get(kind, 0) + 1
        total += size
    # the footage is the PIE dataset (MIT License): its notice travels with the copies
    shutil.copyfile(os.path.join(ROOT, "third_party", "PIE-LICENSE.txt"), os.path.join(out_dir, "media", "PIE-LICENSE.txt"))

    m = files["archive.json"]
    print("archive written to %s" % os.path.relpath(out_dir, os.getcwd()))
    print("  events          %d (video for %d, detections for %d)" % (m["events"], m["events_with_video"], len(with_detections)))
    print("  detectors       %d" % m["detectors"])
    print("  excluded        %d%s" % (len(m["excluded"]), "".join("\n    " + x for x in m["excluded"])))
    print("  json files      %d (%s)" % (n_json, human(total - sum(media_bytes.values()))))
    print("  thumbs          %d (%s)" % (counts["thumbs"], human(media_bytes["thumbs"])))
    print("  clips           %d (%s)" % (counts["clips"], human(media_bytes["clips"])))
    if missing["thumbs"]:
        print("  missing thumbs  %d (thumb_url set to null)" % len(missing["thumbs"]))
    print("  total           %d files, %s" % (n_json + sum(counts.values()), human(total)))


if __name__ == "__main__":
    main()
