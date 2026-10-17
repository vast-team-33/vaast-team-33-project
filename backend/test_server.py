import gzip
import json
import os
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.error
import urllib.request

import server

A = "20261001_000000_set01_video_chunk_0001_segment_001_of_006"
B = "20261001_000000_set02_video_chunk_0002_segment_002_of_006"


def ev(i, drive, danger, t, agreement, crossing):
    return {"id": i + ".mp4", "drive": drive, "chunk": 1, "segment": 1, "drive_time_sec": t,
            "peak_sec": 1.0, "frames_in_zone": 90, "max_box_h": 300, "frame_h": 1080,
            "bbox": [900, 600, 1000, 900], "speeds": [0.2, 0.3], "suggested_speeds": [0.2, 0.1],
            "clip": "clips/%s.mp4" % i, "thumb": "thumbs/%s.jpg" % i,
            "verdict": {"pedestrian_position": "on_road", "crossing_location": crossing, "ego_car_moving": True,
                        "risk": "low", "recommended_action": "stop", "reason": "r"},
            "raw": "", "danger": danger, "factors": {"closeness": 0.5, "exposure": 1, "location": 1, "moving": 1},
            "actual_action": "stopped", "suggested_action": "stop", "agreement": agreement}


class Judge(BaseHTTPRequestHandler):
    calls = []
    gate = threading.Event()
    fail = False
    lock = threading.Lock()
    live = 0
    peak = 0

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        cls = Judge
        with cls.lock:
            cls.live += 1
            cls.peak = max(cls.peak, cls.live)
            cls.calls.append({"auth": self.headers.get("Authorization"), "body": body})
        cls.gate.wait(10)
        with cls.lock:
            cls.live -= 1
        if cls.fail:
            self.send_response(500)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        text = body["messages"][0]["content"][0]["text"]
        match = "cyclist" in text
        content = '<think>hmm {not json}</think> ok {"match": %s, "confidence": 0.8, "moment_sec": 2.5, "reason": "A cyclist."} bye' % (
            "true" if match else "false")
        out = json.dumps({"choices": [{"message": {"content": content}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.judge = HTTPServer(("127.0.0.1", 0), Judge)
        threading.Thread(target=cls.judge.serve_forever, daemon=True).start()
        os.environ["COSMOS_URL"] = "http://127.0.0.1:%d/v1/chat/completions" % cls.judge.server_address[1]
        os.environ["GPU_BEARER_TOKEN"] = "tok"
        cls.tmp = tempfile.TemporaryDirectory()
        d = cls.tmp.name
        for sub in ("clips", "thumbs", "sidecars"):
            os.makedirs(os.path.join(d, sub))
        with open(os.path.join(d, "events.json"), "w") as f:
            json.dump({"scanned": 10, "in_zone": 4, "stop_threshold": 0.35, "events": [
                ev(A, "set01", 80, 50, "driver_as_careful", "marked_crosswalk"),
                ev(B, "set02", 40, 10, "driver_less_careful", "outside_crosswalk")]}, f)
        cls.clip = bytes(range(256)) * 4
        with open(os.path.join(d, "clips", A + ".mp4"), "wb") as f:
            f.write(cls.clip)
        frames = [{"frame_index": i, "time_sec": i / 30, "detections": [
            {"label": "person", "confidence": 0.9, "bbox": [900, 600, 1000, 900]},
            {"label": "person", "confidence": 0.2, "bbox": [900, 600, 1000, 900]},
            {"label": "person", "confidence": 0.8, "bbox": [100, 600, 200, 900]}]} for i in range(9)]
        with open(os.path.join(d, "clips", B + ".mp4"), "wb") as f:
            f.write(cls.clip)
        with gzip.open(os.path.join(d, "sidecars", A + ".json.gz"), "wt") as f:
            json.dump({"video_shape": [1080, 1920], "fps": 30, "frames": frames}, f)
        cls.srv = server.make_server("127.0.0.1", 0, d, os.path.join(d, "nostatic"))
        cls.base = "http://127.0.0.1:%d" % cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.judge.shutdown()
        cls.srv.server_close()
        cls.tmp.cleanup()

    def req(self, path, method="GET", body=None, headers=None, raw=False):
        data = body if isinstance(body, bytes) else (json.dumps(body).encode() if body is not None else None)
        r = urllib.request.Request(self.base + path, data=data, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(r) as resp:
                b = resp.read()
                return resp.status, (b if raw else json.loads(b)), resp
        except urllib.error.HTTPError as e:
            b = e.read()
            return e.code, (b if raw else json.loads(b)), e

    def test_list_filter_sort_page(self):
        s, j, resp = self.req("/api/events")
        self.assertEqual(s, 200)
        self.assertEqual(resp.headers["Access-Control-Allow-Origin"], "*")
        self.assertEqual([e["danger"] for e in j["items"]], [80, 40])
        self.assertEqual(j["total"], 2)
        e = j["items"][0]
        self.assertEqual(e["clip_url"], "media/clips/%s.mp4" % A)
        self.assertEqual(e["detector_id"], "crossing_risk")
        self.assertEqual(self.req("/api/events?min_danger=50")[1]["total"], 1)
        self.assertEqual(self.req("/api/events?crossing=outside_crosswalk")[1]["items"][0]["id"], B)
        self.assertEqual(self.req("/api/events?agreement=driver_as_careful")[1]["total"], 1)
        self.assertEqual(self.req("/api/events?drive=set02")[1]["total"], 1)
        self.assertEqual(self.req("/api/events?position=on_road")[1]["total"], 2)
        self.assertEqual(self.req("/api/events?sort=drive_time_asc")[1]["items"][0]["id"], A)
        j = self.req("/api/events?limit=1&offset=1")[1]
        self.assertEqual((j["total"], len(j["items"]), j["items"][0]["id"]), (2, 1, B))
        self.assertEqual(self.req("/api/events?limit=999")[1]["limit"], 200)
        self.assertEqual(self.req("/api/events?min_danger=x")[0], 400)

    def test_event_and_404(self):
        self.assertEqual(self.req("/api/events/" + A)[0], 200)
        s, j, _ = self.req("/api/events/nope")
        self.assertEqual(s, 404)
        self.assertEqual(j["error"]["code"], "not_found")

    def test_detections(self):
        s, j, _ = self.req("/api/events/%s/detections" % A)
        self.assertEqual(s, 200)
        self.assertEqual(len(j["frames"]), 3)
        boxes = j["frames"][0]["boxes"]
        self.assertEqual(len(boxes), 2)
        self.assertEqual([b["in_lane"] for b in boxes], [True, False])
        self.assertEqual(self.req("/api/events/%s/detections" % B)[0], 404)

    def test_feedback(self):
        p = "/api/events/%s/feedback" % B
        self.assertEqual(self.req(p, "POST", {"choice": "bad"})[0], 400)
        self.assertEqual(self.req(p, "POST", {"choice": "model_right", "note": "x" * 501})[0], 400)
        self.assertEqual(self.req(p, "POST", b"{" + b" " * 3000 + b"}")[0], 413)
        self.assertEqual(self.req("/api/events/nope/feedback", "POST", {"choice": "model_right"})[0], 404)
        s, j, _ = self.req(p, "POST", {"choice": "model_right", "note": "hi"})
        self.assertEqual(s, 201)
        self.assertTrue(j["id"].startswith("fb_") and j["created_at"].endswith("Z"))
        self.assertEqual(self.req(p, "POST", {"choice": "false_alarm"})[1]["choice"], "false_alarm")
        items = self.req("/api/feedback?event_id=" + B)[1]["items"]
        self.assertEqual(items[0]["choice"], "false_alarm")
        self.assertEqual(self.req("/api/events/" + B)[1]["feedback"]["choice"], "false_alarm")
        self.assertEqual(self.req("/api/events?has_feedback=true")[1]["total"], 1)
        self.assertEqual(self.req("/api/summary")[1]["feedback_count"], 2)

    def test_scenario_export(self):
        s, j, _ = self.req("/api/events/%s/scenario" % A)
        self.assertEqual(s, 200)
        for k in ("scenario_id", "source_event_id", "format", "summary", "danger", "ego", "actors",
                  "environment", "variations", "generation_prompt", "targets"):
            self.assertIn(k, j)
        self.assertEqual(len(j["variations"]), 6)
        self.assertTrue(j["actors"][0]["image_track"])
        s, j, _ = self.req("/api/events/%s/scenario" % B)
        self.assertEqual(j["actors"][0]["image_track"][0]["bbox"], [900, 600, 1000, 900])
        p = "/api/events/%s/export" % A
        s, j, _ = self.req(p, "POST", {"target": "omniverse"})
        self.assertEqual((s, j["demo"], j["status"]), (202, True, "queued"))
        self.assertEqual(self.req(p, "POST", {"target": "x"})[0], 400)

    def test_range_and_media(self):
        s, b, resp = self.req("/media/clips/%s.mp4" % A, headers={"Range": "bytes=10-19"}, raw=True)
        self.assertEqual(s, 206)
        self.assertEqual(b, self.clip[10:20])
        self.assertEqual(resp.headers["Content-Range"], "bytes 10-19/%d" % len(self.clip))
        s, b, _ = self.req("/media/clips/%s.mp4" % A, raw=True)
        self.assertEqual((s, len(b)), (200, len(self.clip)))
        self.assertEqual(self.req("/media/clips/nope.mp4", raw=True)[0], 404)

    def test_misc(self):
        self.assertEqual(self.req("/api/nothing")[0], 404)
        self.assertEqual(self.req("/api/health")[1], {"ok": True})
        self.assertEqual(self.req("/api/config")[1]["stop_threshold"], 0.35)
        self.assertEqual(self.req("/api/detectors")[1]["items"][0]["event_count"], 2)
        self.assertEqual(self.req("/api/runs/x")[0], 404)
        s, b, _ = self.req("/", raw=True)
        self.assertEqual(s, 200)
        self.assertIn(b"not built", b)

    def wait_run(self, rid):
        for _ in range(100):
            run = self.req("/api/runs/" + rid)[1]
            if run["status"] != "running":
                break
            time.sleep(0.1)
        return run

    def test_detectors_flow(self):
        good = {"name": "Cyclist", "prompt": "A cyclist rides close.", "description": "d",
                "prefilter": {"object_class": "person", "in_lane": True}}
        for bad in ({}, {"name": "x"}, dict(good, name="n" * 81), dict(good, prompt="p" * 801),
                    dict(good, description="d" * 301), dict(good, prefilter={"in_lane": "yes"}),
                    dict(good, prefilter="x")):
            self.assertEqual(self.req("/api/detectors", "POST", bad)[0], 400, bad)
        s, d, _ = self.req("/api/detectors", "POST", good)
        self.assertEqual(s, 201)
        self.assertRegex(d["id"], r"^det_\d{4}$")
        self.assertEqual((d["status"], d["kind"], d["event_count"]), ("draft", "user", 0))
        did = d["id"]
        self.assertEqual(self.req("/api/detectors/" + did)[1]["name"], "Cyclist")
        self.assertEqual(self.req("/api/detectors/nope")[0], 404)
        items = self.req("/api/detectors")[1]["items"]
        self.assertEqual([i["id"] for i in items][:2], ["crossing_risk", did])
        self.assertEqual(self.req("/api/detectors/nope/preview", "POST", {})[0], 404)
        self.assertEqual(self.req("/api/detectors/%s/preview" % did, "POST", {"event_id": "zzz"})[0], 404)

        Judge.gate.set()
        s, j, _ = self.req("/api/detectors/%s/preview" % did, "POST", {"event_id": B})
        self.assertEqual(s, 200)
        self.assertEqual((j["sample_event_id"], j["result"]["match"], j["result"]["confidence"]), (B, True, 0.8))
        self.assertEqual((j["result"]["moment_sec"], j["model"]), (2.5, "nvidia/cosmos3-nano-reasoner"))
        self.assertIsInstance(j["latency_ms"], int)
        c = Judge.calls[-1]
        self.assertEqual(c["auth"], "Bearer tok")
        self.assertEqual(c["body"]["temperature"], 0)
        self.assertEqual(c["body"]["max_tokens"], 200)
        self.assertIn("A cyclist rides close.", c["body"]["messages"][0]["content"][0]["text"])
        self.assertTrue(c["body"]["messages"][0]["content"][1]["video_url"]["url"].startswith("data:video/mp4;base64,"))
        self.assertEqual(self.req("/api/detectors/" + did)[1]["status"], "tested")
        s, j, _ = self.req("/api/detectors/%s/preview" % did, "POST")
        self.assertEqual((s, j["sample_event_id"]), (200, A))

        Judge.gate.clear()
        Judge.peak = 0
        s, r, _ = self.req("/api/detectors/%s/runs" % did, "POST", {"max_clips": 10})
        self.assertEqual(s, 202)
        self.assertEqual(r["detector_id"], did)
        self.assertEqual(self.req("/api/detectors/%s/runs" % did, "POST", {})[0], 409)
        self.assertEqual(self.req("/api/detectors/" + did)[1]["status"], "running")
        time.sleep(0.3)
        mid = self.req("/api/runs/" + r["run_id"])[1]
        self.assertEqual(mid["status"], "running")
        self.assertEqual(mid["progress"]["total"], 1)  # only A has a person in the lane sidecar
        Judge.gate.set()
        run = self.wait_run(r["run_id"])
        self.assertEqual(run["status"], "completed")
        self.assertEqual((run["progress"], run["matched"]), ({"done": 1, "total": 1}, 1))
        self.assertTrue(run["finished_at"])
        self.assertLessEqual(Judge.peak, 2)
        self.assertEqual(self.req("/api/detectors/" + did)[1]["status"], "active")
        self.assertEqual(self.req("/api/detectors/" + did)[1]["event_count"], 1)
        j = self.req("/api/events?detector_id=" + did)[1]
        self.assertEqual(j["total"], 1)
        e = j["items"][0]
        self.assertEqual((e["detector_id"], e["danger"], e["reason"], e["drive"]), (did, 80, "A cyclist.", "set01"))
        self.assertEqual((e["clip_url"], e["risk"], e["speeds"]), ("media/clips/%s.mp4" % A, "none", []))
        self.assertEqual(self.req("/api/events/" + e["id"])[0], 200)
        self.assertEqual(self.req("/api/events")[1]["total"], 2)
        self.assertEqual(self.req("/api/events?detector_id=crossing_risk")[1]["total"], 2)

        s, d2, _ = self.req("/api/detectors", "POST", {"name": "Dog", "prompt": "A dog."})
        s, r2, _ = self.req("/api/detectors/%s/runs" % d2["id"], "POST", {"drives": ["set02"]})
        run = self.wait_run(r2["run_id"])
        self.assertEqual((run["status"], run["progress"], run["matched"]), ("completed", {"done": 1, "total": 1}, 0))
        self.assertEqual(self.req("/api/runs/nope")[0], 404)

        Judge.fail = True
        try:
            s, j, _ = self.req("/api/detectors/%s/preview" % did, "POST", {})
            self.assertEqual((s, j["error"]["code"]), (502, "gpu_error"))
            s, r3, _ = self.req("/api/detectors/%s/runs" % d2["id"], "POST", {})
            self.assertEqual(self.wait_run(r3["run_id"])["status"], "failed")
            self.assertEqual(self.req("/api/detectors/" + d2["id"])[1]["status"], "failed")
        finally:
            Judge.fail = False

        p = "/api/detectors/%s/export" % did
        s, j, _ = self.req(p, "POST", {"target": "openscenario", "min_danger": 10})
        self.assertEqual((s, j["demo"], j["status"], j["message"]), (202, True, "queued", server.DEMO_MSG))
        self.assertEqual(self.req(p, "POST", {"target": "x"})[0], 400)
        self.assertEqual(self.req("/api/detectors/nope/export", "POST", {"target": "omniverse"})[0], 404)


if __name__ == "__main__":
    unittest.main()
