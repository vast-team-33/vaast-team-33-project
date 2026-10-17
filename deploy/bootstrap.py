#!/usr/bin/env python3
"""Container-start bootstrap: rebuild DATA_DIR from events.json + S3. Idempotent."""
import glob
import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

DATA_DIR = os.environ.get("DATA_DIR", "/data")
CONFIG_DIR = os.environ.get("CONFIG_DATA_DIR", "/config-data")
BUCKET = os.environ["S3_SEGMENTS_BUCKET"]


def log(*a):
    print("[bootstrap]", *a, flush=True)


def s3_client():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3", endpoint_url=os.environ["S3_ENDPOINT"],
        aws_access_key_id=os.environ["ACCESS_KEY"],
        aws_secret_access_key=os.environ["SECRET_KEY"],
        verify=False, config=Config(retries={"max_attempts": 5}, max_pool_connections=16))


def download(s3, key, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "cached"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    from boto3.s3.transfer import TransferConfig
    # One thread per file: multipart threads x 8 workers ran the pod out of memory (exit 137).
    s3.download_file(BUCKET, key, tmp, Config=TransferConfig(use_threads=False))
    os.replace(tmp, dest)
    return "downloaded"


def thumb(ev, clip, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "cached"
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    vf = []
    bb = ev.get("bbox")
    if bb and len(bb) == 4:
        x1, y1, x2, y2 = [float(v) for v in bb]
        vf.append("drawbox=x=%d:y=%d:w=%d:h=%d:color=red:t=6"
                  % (x1, y1, max(1, x2 - x1), max(1, y2 - y1)))
    vf.append("scale=960:-2")
    tmp = dest + ".part.jpg"
    cmd = [ff, "-nostdin", "-y", "-loglevel", "error", "-ss", str(ev.get("peak_sec", 0)),
           "-i", clip, "-frames:v", "1", "-vf", ",".join(vf), tmp]
    subprocess.run(cmd, check=True, stdin=subprocess.DEVNULL)
    os.replace(tmp, dest)
    return "generated"


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    src = os.path.join(CONFIG_DIR, "events.json")
    dst = os.path.join(DATA_DIR, "events.json")
    if os.path.exists(src):
        shutil.copyfile(src, dst)
    elif not os.path.exists(dst):
        log("no events.json in", CONFIG_DIR, "or", DATA_DIR)
        return 1
    with open(dst) as fh:
        events = json.load(fh).get("events", [])
    log("events:", len(events))

    heroes = glob.glob(os.path.join(CONFIG_DIR, "*.jpg"))
    if heroes:
        os.makedirs(os.path.join(DATA_DIR, "hero"), exist_ok=True)
        for h in heroes:
            shutil.copyfile(h, os.path.join(DATA_DIR, "hero", os.path.basename(h)))
        log("hero images:", len(heroes))

    s3 = s3_client()

    def work(ev):
        eid = ev["id"]
        stem = eid[:-4] if eid.endswith(".mp4") else eid
        clip = os.path.join(DATA_DIR, "clips", eid)
        side = os.path.join(DATA_DIR, "sidecars", stem + ".json.gz")
        th = os.path.join(DATA_DIR, "thumbs", stem + ".jpg")
        os.makedirs(os.path.dirname(th), exist_ok=True)
        return [download(s3, "segments/" + eid, clip),
                download(s3, "detections/" + stem + ".json.gz", side),
                thumb(ev, clip, th)]

    failed = 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = [(ev.get("id"), ex.submit(work, ev)) for ev in events]
        for i, (eid, f) in enumerate(futs, 1):
            try:
                r = f.result()
                log("%d/%d %s clip=%s sidecar=%s thumb=%s" % (i, len(futs), eid, *r))
            except Exception as e:
                failed += 1
                log("%d/%d FAILED %s: %r" % (i, len(futs), eid, e))
    if failed:
        log("failures:", failed)
        return 1
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
