# Stage 1b (no GPU, W&B Inference). Re-judge WHERE the pedestrian stands with Nemotron VL, because
# Cosmos3-Reason often calls people on the right-hand sidewalk "on_road" (issue #9).
# Reads web/raw.json, writes web/raw_vl.json (same schema; verdict.pedestrian_position replaced by the VL
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
PROMPT = ("This is a dashcam frame. One pedestrian is marked with a RED box. Is the person inside the RED box "
          "standing on the driving surface of the road, on a marked crosswalk, or on the sidewalk/curb? "
          "Note the car drives on the right; people at the right edge of the frame beside the road are usually "
          "on the sidewalk. Answer with JSON only, no other text: "
          '{"position": "on_road" | "on_crosswalk" | "on_sidewalk_or_curb" | "unclear", '
          '"confidence": 0-1, "reason": "one sentence"}')

try:
    import weave
    weave.init(f"{TEAM}/{PROJ}")
    op = weave.op
except Exception as ex:  # tracing is optional
    print("weave disabled:", type(ex).__name__)
    op = lambda f: f


@op
def judge(thumb_path: str) -> dict:
    b64 = base64.b64encode(open(thumb_path, "rb").read()).decode()
    r = client.chat.completions.create(model=MODEL, max_tokens=3000, temperature=0, messages=[{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}]}])
    txt = re.sub(r"<think>.*?</think>", "", r.choices[0].message.content or "", flags=re.S)
    m = re.search(r"\{.*\}", txt, re.S)
    d = json.loads(m.group(0))
    pos = d.get("position")
    return {"position": pos if pos in POSITIONS else "unclear", "confidence": float(d.get("confidence", 0)),
            "reason": str(d.get("reason", ""))}


def one(e):
    try:
        return judge(os.path.join(WEB, e["thumb"]))
    except Exception as ex:
        return {"position": "unclear", "confidence": 0.0, "reason": f"VL call failed: {type(ex).__name__}"}


if __name__ == "__main__":
    raw = json.load(open(os.path.join(WEB, "raw.json")))
    with cf.ThreadPoolExecutor(2) as ex:      # shared endpoint: at most 2 in flight
        results = list(ex.map(one, raw["events"]))
    changed = 0
    for e, vl in zip(raw["events"], results):
        v = e["verdict"] = e.get("verdict") or {}
        v["cosmos_position"] = v.get("pedestrian_position")
        if vl["confidence"] >= MIN_CONF and vl["position"] != "unclear":
            v["pedestrian_position"], v["position_source"] = vl["position"], "nemotron_vl"
        else:
            v["position_source"] = "cosmos"
        v["position_reason"] = vl["reason"]
        v["vl_position"], v["vl_confidence"] = vl["position"], vl["confidence"]
        changed += v["pedestrian_position"] != v["cosmos_position"]
        print(f"{e['id'][:40]} cosmos={v['cosmos_position']} vl={vl['position']}@{vl['confidence']:.2f} -> {v['position_source']}")
    json.dump(raw, open(os.path.join(WEB, "raw_vl.json"), "w"), indent=1)
    print(f"wrote raw_vl.json; {changed}/{len(raw['events'])} positions changed")
