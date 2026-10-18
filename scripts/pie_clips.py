#!/usr/bin/env python3
"""Get the archive's 5 s clips back from the public PIE dataset, which the lab's Toronto footage came from.

The lab's copies of the clips went with the lab. The footage is the PIE dataset (York University,
MIT License, see third_party/PIE-LICENSE.txt): https://data.nvision2.eecs.yorku.ca/PIE_dataset
Each lab set (set01..set06) was the first 15 minutes of that PIE set: video_0001.mp4 followed by
video_0002.mp4. The lab's 30 s chunks drift by up to 8 s from that, so each clip is placed by matching
its event thumbnail against the PIE video, which lands within 0.1 s of the event's peak_sec.

    pie_clips.py cut     # stdlib + ffmpeg: cut every clip listed in scripts/pie_clip_times.json that is
                         # missing from data/demo-snapshot/clips/ (reads about 10 MB per clip over HTTP ranges)
    pie_clips.py find    # numpy + opencv: redo the matching from the thumbnails and rewrite pie_clip_times.json

Then blur the new clips (scripts/blur_media.py) and rebuild the archive (scripts/build_archive.py).
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIE = "https://data.nvision2.eecs.yorku.ca/PIE_dataset/PIE_clips"
TIMES = os.path.join(ROOT, "scripts", "pie_clip_times.json")
CLIPS = os.path.join(ROOT, "data", "demo-snapshot", "clips")
THUMBS = os.path.join(ROOT, "data", "demo-snapshot", "thumbs")
CLIP_SEC = 5


def cut():
    times = json.load(open(TIMES))
    os.makedirs(CLIPS, exist_ok=True)
    for eid, t in sorted(times.items()):
        out = os.path.join(CLIPS, eid + ".mp4")
        if os.path.exists(out):
            continue
        subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-ss", str(t["start_sec"]), "-i", f"{PIE}/{t['file']}",
                        "-t", str(CLIP_SEC), "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart", out], check=True)
        print("cut", eid)


def find():
    import numpy as np
    import cv2

    W, H, FPS = 160, 90, 10
    events = json.load(open(os.path.join(ROOT, "archive", "api", "events.json")))["items"]
    first_len = {}                                   # length of video_0001 per set, from the file header

    def length(s):
        if s not in first_len:
            r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                f"{PIE}/{s}/video_0001.mp4"], capture_output=True, text=True, check=True)
            first_len[s] = float(r.stdout)
        return first_len[s]

    def frames(url, start, sec):
        raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", str(max(0.0, start)), "-i", url, "-t", str(sec),
                              "-vf", f"fps={FPS},scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                             capture_output=True, check=True).stdout
        return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)

    def ncc(a, b):
        a, b = a - a.mean(), b - b.mean()
        return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-6))

    def search(s, set_t, ref, win):
        vid, local = ("video_0001", set_t) if set_t < length(s) else ("video_0002", set_t - length(s))
        start = max(0.0, local - win)
        scores = [ncc(f, ref) for f in frames(f"{PIE}/{s}/{vid}.mp4", start, 2 * win)]
        i = int(np.argmax(scores))
        return vid, start + i / FPS, scores[i], i < 3 or i > len(scores) - 4

    out, drift = {}, {}
    for e in sorted(events, key=lambda e: (e["drive"], e["drive_time_sec"])):
        s, t, peak = e["drive"], float(e["drive_time_sec"]), float(e["peak_sec"])
        ref = cv2.resize(cv2.imread(os.path.join(THUMBS, e["id"] + ".jpg"), cv2.IMREAD_GRAYSCALE), (W, H),
                         interpolation=cv2.INTER_AREA).astype(np.float32)
        guess = t + drift.get(s, -4.5) + peak
        vid, best, score, edge = search(s, guess, ref, 5)
        if score < 0.9 or edge:
            vid, best, score, edge = search(s, guess, ref, 14)
        if score < 0.9 or edge:
            raise SystemExit(f"no clear match for {e['id']} (best ncc {score:.3f}); check it by hand")
        start = round(best - peak, 2)
        drift[s] = start + (length(s) if vid == "video_0002" else 0) - t
        out[e["id"]] = {"file": f"{s}/{vid}.mp4", "start_sec": start, "match_ncc": round(score, 3)}
        print(f"{e['id']}: {s}/{vid}.mp4 at {start:.2f}s (ncc {score:.3f})")
    with open(TIMES, "w") as f:
        f.write(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    {"cut": cut, "find": find}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
