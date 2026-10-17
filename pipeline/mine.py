# NOTE: this file now lives in the repo (pipeline/); it was previously an untracked spike in ~/jaywalk.
# THROWAWAY SPIKE, stage 1 (uses the GPU). Find pedestrians in the car's path in the Toronto dashcam
# footage, measure what the car did (optical flow), and ask Cosmos what it sees and what the car should do.
# Writes web/raw.json, web/clips/, web/thumbs/. Stage 2 (build.py) turns raw.json into events.json.
# Run on the VM:  ~/exp/venv/bin/python mine.py [top_n]
import os, re, sys, json, gzip, base64, subprocess, concurrent.futures as cf
import cv2, numpy as np, requests, urllib3, boto3

urllib3.disable_warnings()
TOP_N = int(sys.argv[1]) if len(sys.argv) > 1 else 24
DATA = os.environ.get("JAY_DATA", os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(DATA, "web")
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
for d in ("clips", "thumbs"):
    os.makedirs(os.path.join(WEB, d), exist_ok=True)

s3 = boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT"], aws_access_key_id=os.environ["ACCESS_KEY"],
                  aws_secret_access_key=os.environ["SECRET_KEY"], verify=False)
SEG = os.environ["S3_SEGMENTS_BUCKET"]
COSMOS = "http://166.19.38.112:8001/v1/chat/completions"
GH = {"Authorization": f"Bearer {os.environ['GPU_BEARER_TOKEN']}"}

keys = []
for page in s3.get_paginator("list_objects_v2").paginate(Bucket=SEG, Prefix="detections/"):
    keys += [o["Key"] for o in page.get("Contents", []) if re.search(r"_set0\d_video_chunk_\d+_segment_", o["Key"])]
print(f"toronto segments: {len(keys)}")


def load(k):
    return k, json.loads(gzip.decompress(s3.get_object(Bucket=SEG, Key=k)["Body"].read()))


# Lane-shaped zone for the road ahead: wide at the bottom, narrow toward the horizon (fractions of W, H).
TOP_Y, BOT_Y = 0.55, 0.93
TOP_X, BOT_X = (0.42, 0.58), (0.25, 0.75)


def in_lane(x, y, W, H):
    fy = y / H
    if not TOP_Y <= fy <= BOT_Y:
        return False
    k = (fy - TOP_Y) / (BOT_Y - TOP_Y)
    left = TOP_X[0] + k * (BOT_X[0] - TOP_X[0])
    right = TOP_X[1] + k * (BOT_X[1] - TOP_X[1])
    return left <= x / W <= right


def score(d):
    H, W = d["video_shape"]
    best, frames_in_zone = None, 0
    for f in d["frames"]:
        hit = None
        for x in f["detections"]:
            if x["label"] != "person" or x["confidence"] < 0.4:
                continue
            x1, y1, x2, y2 = x["bbox"]
            if in_lane((x1 + x2) / 2, y2, W, H):       # the person's feet are in the lane
                h = y2 - y1
                if hit is None or h > hit[0]:
                    hit = (h, f["frame_index"], x["bbox"])
        if hit:
            frames_in_zone += 1
            if best is None or hit[0] > best[0]:
                best = hit
    return frames_in_zone, best, (W, H), float(d["fps"])


cands = []
with cf.ThreadPoolExecutor(16) as ex:
    for k, d in ex.map(load, keys):
        n, best, wh, fps = score(d)
        if n >= 10:
            cands.append({"key": k, "frames_in_zone": n, "best": best, "wh": wh, "fps": fps})
print(f"segments with a person in the lane: {len(cands)}")
cands.sort(key=lambda c: -c["best"][0])
picked, seen = [], set()
for c in cands:
    chunk = c["key"].split("_segment_")[0]
    if chunk not in seen:
        seen.add(chunk)
        picked.append(c)
    if len(picked) == TOP_N:
        break


def speed_profile(clip, step=6):
    """Median optical-flow magnitude between frames 0.2 s apart: a relative measure of the car's speed."""
    cap, prev, out, i = cv2.VideoCapture(clip), None, [], 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i % step == 0:
            g = cv2.cvtColor(cv2.resize(frame, (320, 180)), cv2.COLOR_BGR2GRAY)[: int(180 * 0.85)]  # drop the hood
            if prev is not None:
                flow = cv2.calcOpticalFlowFarneback(prev, g, None, 0.5, 3, 15, 3, 5, 1.2, 0)
                out.append(round(float(np.median(np.linalg.norm(flow, axis=2))), 3))
            prev = g
        i += 1
    return out


PROMPT = """You are reviewing a 5-second dashcam clip recorded by a car (the ego car).
Focus on the pedestrian closest to the ego car's lane.
A marked crosswalk has white zebra stripes or two parallel white lines across the road.
Answer with JSON only, no other text:
{"pedestrian_position": "on_road" or "on_crosswalk" or "on_sidewalk_or_curb" or "none",
 "crossing_location": "marked_crosswalk" or "outside_crosswalk" or "not_crossing" or "unclear",
 "ego_car_moving": true or false,
 "risk": "none" or "low" or "medium" or "high",
 "recommended_action": "stop" or "slow_down" or "proceed_with_caution" or "proceed",
 "reason": "one short sentence"}
Only use on_road if the pedestrian's feet are on the driving surface, not on the sidewalk or curb.
recommended_action is what a careful driver of the ego car should do at the start of this clip."""


def judge(c):
    name = c["key"].rsplit("/", 1)[-1].replace(".json.gz", ".mp4")
    clip = os.path.join(WEB, "clips", name)
    if not os.path.exists(clip):
        s3.download_file(SEG, "segments/" + name, clip)
    h, fi, (x1, y1, x2, y2) = c["best"]
    W, H = c["wh"]
    t = fi / c["fps"]
    thumb = os.path.join(WEB, "thumbs", name.replace(".mp4", ".jpg"))
    # lane outline: three drawbox calls approximate it poorly, so draw the box and a centre guide instead
    vf = (f"drawbox=x={int(x1)}:y={int(y1)}:w={int(x2 - x1)}:h={int(y2 - y1)}:color=red:t=6,scale=960:-2")
    subprocess.run([FFMPEG, "-nostdin", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", clip, "-frames:v", "1", "-vf", vf, thumb], check=True)
    speeds = speed_profile(clip)
    video = base64.b64encode(open(clip, "rb").read()).decode()
    verdict, raw = None, ""
    try:
        r = requests.post(COSMOS, headers=GH, timeout=180, json={
            "model": "nvidia/cosmos3-nano-reasoner", "temperature": 0, "max_tokens": 300,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": PROMPT},
                {"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{video}"}}]}]})
        r.raise_for_status()
        raw = r.json()["choices"][0]["message"]["content"] or ""
        body = re.sub(r"<think>.*?</think>", "", raw, flags=re.S)
        verdict = json.loads(body[body.find("{"): body.rfind("}") + 1])
    except Exception as e:
        raw = raw or f"error: {e}"
    m = re.search(r"_(set\d+)_video_chunk_(\d+)_segment_(\d+)_of", name)
    drive, chunk, seg = m.group(1), int(m.group(2)), int(m.group(3))
    return {"id": name, "drive": drive, "chunk": chunk, "segment": seg, "drive_time_sec": chunk * 30 + (seg - 1) * 5,
            "peak_sec": round(t, 2), "frames_in_zone": c["frames_in_zone"], "max_box_h": int(h), "frame_h": H,
            "bbox": [int(v) for v in (x1, y1, x2, y2)], "speeds": speeds,
            "clip": "clips/" + name, "thumb": "thumbs/" + name.replace(".mp4", ".jpg"),
            "verdict": verdict, "raw": raw[:600]}


events = []
with cf.ThreadPoolExecutor(2) as ex:   # shared GPU: at most 2 calls in flight
    for ev in ex.map(judge, picked):
        v = ev["verdict"] or {}
        sp = ev["speeds"]
        print(f"{ev['drive']} c{ev['chunk']:02d} s{ev['segment']}: {v.get('pedestrian_position')} / {v.get('crossing_location')} / "
              f"{v.get('risk')} / do: {v.get('recommended_action')} | speed first {sp[:3]} last {sp[-3:]}")
        events.append(ev)

json.dump({"scanned": len(keys), "in_zone": len(cands), "events": events}, open(os.path.join(WEB, "raw.json"), "w"), indent=1)
print("raw written:", len(events))
