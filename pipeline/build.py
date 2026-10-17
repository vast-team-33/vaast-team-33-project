# NOTE: this file now lives in the repo (pipeline/); it was previously an untracked spike in ~/jaywalk.
# THROWAWAY SPIKE, stage 2 (no GPU). raw.json -> events.json: danger score, what the car did,
# what the model suggests, the suggested speed curve, and whether the two agree. Tune and rerun freely.
import os, json

DATA = os.environ.get("JAY_DATA", os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(DATA, "web")
STOP = 0.35          # median flow (px per 0.2 s at 320 px wide) below this = car not moving; tuned by eye

RAW_IN = os.environ.get("RAW_IN", "raw.json")
EVENTS_OUT = os.environ.get("EVENTS_OUT", "events.json")
raw = json.load(open(os.path.join(WEB, RAW_IN)))


def actual_action(sp):
    if not sp:
        return "unknown"
    n = max(1, len(sp) // 5)
    v0, v1 = sum(sp[:n]) / n, sum(sp[-n:]) / n
    if max(sp) < STOP:
        return "was_stopped"
    if v1 < STOP:
        return "stopped"
    if v1 < 0.6 * v0:
        return "slowed_down"
    if v1 > 1.4 * v0 and v0 >= STOP:
        return "accelerated"
    return "kept_speed"


CAUTION_ACTUAL = {"accelerated": 0, "kept_speed": 0, "slowed_down": 2, "stopped": 3, "was_stopped": 3, "unknown": None}
CAUTION_SUGGESTED = {"proceed": 0, "proceed_with_caution": 1, "slow_down": 2, "stop": 3}
TARGET = {"proceed": 1.0, "proceed_with_caution": 0.75, "slow_down": 0.5, "stop": 0.0}


def suggested_curve(sp, action):
    """What the speed curve would look like if the car followed the suggestion from the start of the clip."""
    if not sp or action not in TARGET:
        return []
    v0, goal, n = sp[0], sp[0] * TARGET[action], len(sp)
    ramp = max(1, int(n * 0.5))   # reach the target within about 2.5 s
    return [round(v0 + (goal - v0) * min(1, i / ramp), 3) for i in range(n)]


LOC = {"on_road": 1.0, "on_crosswalk": 0.6, "on_sidewalk_or_curb": 0.15, "none": 0.05}

dropped_non_pedestrian = 0
events = []
for e in raw["events"]:
    if (e.get("verdict") or {}).get("subject", "pedestrian") != "pedestrian":
        dropped_non_pedestrian += 1       # cyclist / scooter / other (YOLO labels riders "person")
        continue
    v = e["verdict"] or {}
    sp = e["speeds"]
    closeness = min(1.0, e["max_box_h"] / (0.5 * e["frame_h"]))       # box half the frame tall = very close
    exposure = min(1.0, e["frames_in_zone"] / 150)                     # share of the 5 s in the lane
    location = LOC.get(v.get("pedestrian_position"), 0.3)
    if v.get("crossing_location") == "outside_crosswalk" and v.get("pedestrian_position") == "on_road":
        location = 1.0
    moving = 1.0 if (sp and max(sp) >= STOP) else 0.35
    danger = round(100 * (closeness ** 0.7) * (0.6 + 0.4 * exposure) * location * moving)
    did = actual_action(sp)
    sug = v.get("recommended_action", "unknown")
    a, s = CAUTION_ACTUAL.get(did), CAUTION_SUGGESTED.get(sug)
    if a is None or s is None:
        agree = "unknown"
    elif a >= s:
        agree = "driver_as_careful" if a == s or (a == 3 and s >= 2) else "driver_more_careful"
    else:
        agree = "driver_less_careful"
    e.update({"danger": danger, "factors": {"closeness": round(closeness, 2), "exposure": round(exposure, 2),
              "location": location, "moving": moving},
              "actual_action": did, "suggested_action": sug, "agreement": agree,
              "suggested_speeds": suggested_curve(sp, sug)})
    events.append(e)

events.sort(key=lambda e: -e["danger"])


def same_footage(a, b):
    """Identical speeds, or segment 6 of chunk N vs segment 1 of chunk N+1 of the same drive with near-identical speeds."""
    if a["speeds"] and a["speeds"] == b["speeds"]:
        return True
    for x, y in ((a, b), (b, a)):
        if (x["drive"] == y["drive"] and x["segment"] == 6 and y["segment"] == 1 and y["chunk"] == x["chunk"] + 1
                and x["speeds"] and len(x["speeds"]) == len(y["speeds"])):
            return max(abs(p - q) for p, q in zip(x["speeds"], y["speeds"])) <= 0.02
    return False


kept, dropped_duplicates = [], 0
for e in events:                           # sorted by danger desc, so the first of a duplicate pair is the one to keep
    if any(same_footage(e, k) for k in kept):
        dropped_duplicates += 1
        continue
    kept.append(e)
events = kept
json.dump({"scanned": raw["scanned"], "in_zone": raw["in_zone"], "stop_threshold": STOP,
           "dropped_non_pedestrian": dropped_non_pedestrian, "dropped_duplicates": dropped_duplicates, "events": events},
          open(os.path.join(WEB, EVENTS_OUT), "w"), indent=1)
for e in events:
    print(f"{e['danger']:3d} {e['drive']} c{e['chunk']:02d} {(e['verdict'] or {}).get('pedestrian_position')}: "
          f"did {e['actual_action']}, model says {e['suggested_action']} -> {e['agreement']}")
