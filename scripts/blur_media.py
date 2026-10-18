#!/usr/bin/env python3
"""Blur faces and number plates in footage before it goes public (archive/, api/fixtures/media/).

One-off tool, not part of the app. It needs packages the app does not use, so run it in its own venv:
    python3 -m venv /tmp/blurenv && /tmp/blurenv/bin/pip install deface ultralytics opencv-python-headless
First run downloads the YOLO11m weights (about 40 MB) from the Ultralytics GitHub releases.

    blur_media.py img <src_dir> <out_dir> [scripts/blur_manual.json]   # every .jpg; src may equal out
    blur_media.py vid <in.mp4> <out.mp4>

How it finds things:
  faces   CenterFace (deface package) for faces turned to the camera, plus the head area of every
          YOLO person box, which also covers people seen side-on or from behind.
  plates  stills: white plate-shaped patches inside each YOLO vehicle box, plus manual boxes for the
          ones it misses (blur_manual.json, image pixels, checked by eye on close-up crops).
          video: the whole lower part of each nearby vehicle, since 150 frames cannot be fixed by hand.
Far people and vehicles (under 70 px at 1920 px wide) are left alone: nothing there is readable.

How the archive was made (17 Oct snapshot):
    blur_media.py img data/demo-snapshot/thumbs data/demo-media-blurred/thumbs scripts/blur_manual.json
    blur_media.py vid data/demo-snapshot/clips/<id>.mp4 data/demo-media-blurred/clips/<id>.mp4
    blur_media.py img api/fixtures/media/thumbs api/fixtures/media/thumbs scripts/blur_manual.json
    blur_media.py img api/fixtures/media/hero api/fixtures/media/hero scripts/blur_manual.json
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from deface.centerface import CenterFace
from ultralytics import YOLO, settings

settings.update({"sync": False})      # no Ultralytics usage analytics
THRESH = 0.2                          # deface's default; with upscaling it finds the small dashcam faces
CF = CenterFace(in_shape=None, backend="auto")
DET = YOLO(os.environ.get("BLUR_WEIGHTS", "yolo11m.pt"))
VEHICLES = {"car", "truck", "bus", "motorcycle"}


def faces(img, up):
    big = cv2.resize(img, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC) if up != 1 else img
    dets, _ = CF(big, threshold=THRESH)
    return [(x1 / up, y1 / up, x2 / up, y2 / up) for x1, y1, x2, y2, s in dets]


def objects(img):
    r = DET.predict(img, imgsz=1280, conf=0.2, verbose=False)[0]
    return [(r.names[int(c)], tuple(b)) for c, b in zip(r.boxes.cls.tolist(), r.boxes.xyxy.tolist())]


def head_zone(box, min_h):
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    if h < min_h:                                # far people: the face is a few pixels, nothing to hide
        return None
    return (x1, y1 - 0.06 * h, x2, y1 + 0.26 * h)   # oversized: blur_box's soft edge eats the rim


def plates_in(img, box, min_w):
    """Plate boxes inside a vehicle box: Ontario plates are a white patch with dark characters, about 2:1.
    If none is found on a close vehicle, fall back to the low-centre area where a plate usually sits."""
    x1, y1, x2, y2 = (int(v) for v in box)
    w, h = x2 - x1, y2 - y1
    if w < min_w:                                # too far away to read a plate
        return []
    rx1, ry1, rx2, ry2 = x1 + int(0.08 * w), y1 + int(0.3 * h), x2 - int(0.08 * w), y2
    roi = img[ry1:ry2, rx1:rx2]
    if roi.size == 0:
        return []
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    white = ((hsv[..., 2] > 140) & (hsv[..., 1] < 70)).astype(np.uint8) * 255
    k = max(3, w // 40)
    white = cv2.morphologyEx(white, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, max(2, k // 2))))
    found = []
    for c in cv2.findContours(white, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
        bx, by, bw, bh = cv2.boundingRect(c)
        if not (1.3 <= bw / max(1, bh) <= 3.8 and 0.07 * w <= bw <= 0.42 * w and bh >= 4):
            continue
        if cv2.contourArea(c) / (bw * bh) < 0.5:
            continue
        found.append((rx1 + bx, ry1 + by, rx1 + bx + bw, ry1 + by + bh))
    if not found and w >= 0.15 * img.shape[1]:
        found.append((x1 + 0.3 * w, y1 + 0.4 * h, x2 - 0.3 * w, y1 + 0.85 * h))
    return found


def blur_box(img, box, scale=1.0, ellipse=True):
    """Strong blur inside the box with a soft edge, so the patch does not look like a pasted block."""
    h, w = img.shape[:2]
    x1, y1, x2, y2 = box
    cx, cy, bw, bh = (x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1) * scale, (y2 - y1) * scale
    x1, x2 = int(max(0, cx - bw / 2)), int(min(w, cx + bw / 2))
    y1, y2 = int(max(0, cy - bh / 2)), int(min(h, cy + bh / 2))
    if x2 - x1 < 3 or y2 - y1 < 3:
        return
    roi = img[y1:y2, x1:x2]
    k = max(3, (max(x2 - x1, y2 - y1) // 2) | 1)
    blurred = cv2.GaussianBlur(cv2.GaussianBlur(roi, (k, k), 0), (k, k), 0)
    m = np.zeros(roi.shape[:2], np.float32)
    rw, rh = x2 - x1, y2 - y1
    if ellipse:
        cv2.ellipse(m, (rw // 2, rh // 2), (max(1, int(rw * 0.42)), max(1, int(rh * 0.42))), 0, 0, 360, 1.0, -1)
    else:
        cv2.rectangle(m, (int(rw * 0.12), int(rh * 0.12)), (int(rw * 0.88), int(rh * 0.88)), 1.0, -1)
    f = max(3, (min(rw, rh) // 4) | 1)
    m = cv2.GaussianBlur(m, (f, f), 0)[..., None]
    roi[:] = (blurred * m + roi * (1 - m)).astype(np.uint8)


def anonymise(img, manual=None, band=False):
    """Blur in place; returns counts. Size thresholds scale with the frame (tuned on 1920 px wide)."""
    s = img.shape[1] / 1920
    fs = faces(img, 3 if img.shape[1] < 1400 else 1.5)
    heads = plates = 0
    for b in fs:
        blur_box(img, b, scale=1.6)
    for label, box in objects(img):
        if label in VEHICLES and box[1] > 0.8 * img.shape[0]:
            continue                             # our own car's bonnet along the bottom edge
        if label == "person":
            z = head_zone(box, 70 * s)
            if z:
                blur_box(img, z)
                heads += 1
        elif label in VEHICLES and band:
            x1, y1, x2, y2 = box
            if x2 - x1 >= 70 * s:
                blur_box(img, (x1, y1 + 0.38 * (y2 - y1), x2, y2 + 0.04 * (y2 - y1)), scale=1.12, ellipse=False)
                plates += 1
        elif label in VEHICLES:
            for z in plates_in(img, box, 70 * s):
                blur_box(img, z, scale=1.6, ellipse=False)
                plates += 1
    for b in (manual or {}).get("faces", []):
        blur_box(img, b, scale=1.6)
    for b in (manual or {}).get("plates", []):
        blur_box(img, b, scale=1.6, ellipse=False)
    return {"faces": len(fs), "heads": heads, "plates": plates}


def images(src, out, manual_file=None):
    manual = json.load(open(manual_file)) if manual_file else {}   # {"x.jpg": {"faces": [[x1,y1,x2,y2]], "plates": [...]}}
    os.makedirs(out, exist_ok=True)
    total = {"faces": 0, "heads": 0, "plates": 0}
    names = sorted(n for n in os.listdir(src) if n.lower().endswith(".jpg"))
    for name in names:
        img = cv2.imread(os.path.join(src, name))
        for k, v in anonymise(img, manual.get(name)).items():
            total[k] += v
        cv2.imwrite(os.path.join(out, name), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(len(names), "images", total)


def video(inp, outp):
    cap = cv2.VideoCapture(inp)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    os.makedirs(os.path.dirname(os.path.abspath(outp)), exist_ok=True)
    enc = subprocess.Popen(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
                            "-s", f"{w}x{h}", "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "slow",
                            "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outp], stdin=subprocess.PIPE)
    total, n = {"faces": 0, "heads": 0, "plates": 0}, 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        for k, v in anonymise(frame, band=True).items():
            total[k] += v
        enc.stdin.write(frame.tobytes())
        n += 1
    enc.stdin.close()
    enc.wait()
    print(n, "frames", total)


if __name__ == "__main__":
    if len(sys.argv) < 4 or sys.argv[1] not in ("img", "vid"):
        raise SystemExit(__doc__)
    if sys.argv[1] == "img":
        images(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    else:
        video(sys.argv[2], sys.argv[3])
