# Ideas explored on 17 Oct

| Idea | Outcome |
|---|---|
| Prompt Gym: tune the caption prompt automatically and measure the search gain | Dropped by the team |
| Mining: people near heavy machines in mining footage | Dropped: the only footage was an internet download (banned) and uploads are not processed |
| Warehouse Floor Twin: click a worker in the indoor warehouse views, see their path, origin, metres walked, close calls with carts | Experiment built and deployed as `floor-tracker` (now scaled to 0). Lessons: YOLO counts humanoid robots as people and misses the carts; tracks break; Nemotron VL fixes the robot and cart problems |
| 3D twin of the warehouse | Possible as a three.js scene driven by tracks (not a 3D scan); not started |
| Synthetic data for self-driving | No generation model on the platform; we can only find and package the moments worth generating |
| **Crossing Risk** (current): pedestrians on the road outside a crosswalk in front of the car, danger score, driver versus model, feedback loop | Experiment v2 deployed at `/app` as `crossing-risk` |

Other ideas noted but not started: "find more like this" search by example (Embed1 video
vectors), a safety investigator agent that writes incident reports, following one truck through
the three highway cameras.
