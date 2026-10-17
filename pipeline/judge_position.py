# Stage 1b (no GPU, W&B Inference). Re-judge WHERE the pedestrian stands with Nemotron VL, because
# Cosmos3-Reason often calls people on the right-hand sidewalk "on_road" (issue #9).
# Reads web/$RAW_IN (raw.json), writes web/$RAW_OUT (raw_vl.json) (same schema; verdict.pedestrian_position replaced by the VL
# answer when confidence >= 0.5; Cosmos value kept in verdict.cosmos_position).
# Run on the VM:  JAY_DATA=~/jaywalk ~/exp/venv/bin/python judge_position.py
# Then:           RAW_IN=raw_vl.json EVENTS_OUT=events_vl.json JAY_DATA=~/jaywalk ~/exp/venv/bin/python build.py
import os, re, json, base64, concurrent.futures as cf
import openai

DATA = os.environ.get("JAY_DATA", os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(DATA, "web")
MODEL = "nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B"
MIN_CONF = 0.5
POSITIONS = {"on_road", "on_crosswalk", "on_sidewalk_or_curb", "unclear"}
TEAM, PROJ = os.environ["WANDB_TEAM"], os.environ["WANDB_PROJECT"]

client = openai.OpenAI(base_url="https://api.inference.wandb.ai/v1", api_key=os.environ["WANDB_API_KEY"],
                       project=f"{TEAM}/{PROJ}")
SUBJECTS = {"pedestrian", "cyclist_or_scooter", "other"}
CROSSINGS = {"marked_crosswalk", "outside_crosswalk", "not_crossing", "unclear"}
PROMPT = ("This is a dashcam frame. One person is marked with a RED box. Look only at the person in the RED box. "
          "Is that person a pedestrian on foot, a cyclist or scooter/e-bike rider, or something else? "
          "Are they standing on the driving surface of the road, on a marked crosswalk, or on the sidewalk/curb? "
          "Are they crossing at a marked crosswalk, crossing outside a crosswalk, or not crossing? "
          "Note the car drives on the right; people at the right edge of the frame beside the road are usually "
          "on the sidewalk. Answer with JSON only, no other text: "
          '{"subject": "pedestrian" | "cyclist_or_scooter" | "other", '
          '"position": "on_road" | "on_crosswalk" | "on_sidewalk_or_curb" | "unclear", '
          '"crossing_location": "marked_crosswalk" | "outside_crosswalk" | "not_crossing" | "unclear", '
          '"confidence": 0-1, "reason": "one sentence"}')

try:
    import weave
    weave.init(f"{TEAM}/{PROJ}")
    op = weave.op
except Exception as ex:  # tracing is optional
    print("weave disabled:", type(ex).__name__)
    op = lambda f: f


def parse_json(txt):
    """Last JSON object in the text that has a 'position' key (the model may think out loud with braces)."""
    dec, found = json.JSONDecoder(), None
    for m in re.finditer(r"\{", txt):
        try:
            obj, _ = dec.raw_decode(txt[m.start():])
        except ValueError:
            continue
        if isinstance(obj, dict) and "position" in obj:
            found = obj
    if found is None:
        raise ValueError("no JSON with position")
    return found


@op
def judge(thumb_path: str) -> dict:
    b64 = base64.b64encode(open(thumb_path, "rb").read()).decode()
    d = None
    for attempt in range(3):             # the model sometimes returns unparseable text; retry
        r = client.chat.completions.create(model=MODEL, max_tokens=3000, temperature=0 if attempt == 0 else 0.3, messages=[{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}]}])
        txt = re.sub(r"<think>.*?</think>", "", r.choices[0].message.content or "", flags=re.S)
        try:
            d = parse_json(txt)
            break
        except ValueError:
            if attempt == 2:
                raise
    pos = d.get("position")
    sub, cl = d.get("subject"), d.get("crossing_location")
    pos = pos if pos in POSITIONS else "unclear"
    cl = cl if cl in CROSSINGS else "unclear"
    if pos == "on_crosswalk":          # keep the labels consistent
        cl = "marked_crosswalk"
    elif pos == "on_sidewalk_or_curb":
        cl = "not_crossing"
    return {"subject": sub if sub in SUBJECTS else "other", "position": pos, "crossing_location": cl,
            "confidence": float(d.get("confidence", 0)), "reason": str(d.get("reason", ""))}


def one(e):
    ex = None
    for _ in range(3):                    # transient API / parse errors
        try:
            return judge(os.path.join(WEB, e["thumb"]))
        except Exception as ex_:
            ex = ex_
    if True:
        return {"subject": "pedestrian", "position": "unclear", "crossing_location": "unclear", "confidence": 0.0, "reason": f"VL call failed: {type(ex).__name__}"}


if __name__ == "__main__":
    raw = json.load(open(os.path.join(WEB, os.environ.get("RAW_IN", "raw.json"))))
    out_name = os.environ.get("RAW_OUT", "raw_vl.json")
    with cf.ThreadPoolExecutor(2) as ex:      # shared endpoint: at most 2 in flight
        results = list(ex.map(one, raw["events"]))
    changed = 0
    for e, vl in zip(raw["events"], results):
        v = e["verdict"] = e.get("verdict") or {}
        v["cosmos_position"] = v.get("pedestrian_position")
        v["cosmos_crossing"] = v.get("crossing_location")
        v["cosmos_reason"] = v.get("reason")
        failed = vl["reason"].startswith("VL call failed")
        v["subject"] = vl["subject"]       # failed call -> "pedestrian" (never drop on a failure)
        if vl["confidence"] >= MIN_CONF and not failed:
            v["pedestrian_position"], v["crossing_location"], v["reason"] = vl["position"], vl["crossing_location"], vl["reason"]
            v["position_source"] = "nemotron_vl"
        else:
            v["position_source"] = "cosmos"
        v["position_reason"] = vl["reason"]
        v["vl_position"], v["vl_confidence"] = vl["position"], vl["confidence"]
        v["vl_crossing_location"] = vl["crossing_location"]
        changed += v["pedestrian_position"] != v["cosmos_position"]
        print(f"{e['id'][:40]} cosmos={v['cosmos_position']} vl={vl['subject']}/{vl['position']}/{vl['crossing_location']}@{vl['confidence']:.2f} -> {v['position_source']}")
    json.dump(raw, open(os.path.join(WEB, out_name), "w"), indent=1)
    print(f"wrote {out_name}; {changed}/{len(raw['events'])} positions changed")
