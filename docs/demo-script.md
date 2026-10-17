# Demo video script (2 minutes)

Target length: 1:55 to 2:05. Never more than 2:10.
Speak slowly. Short sentences. Do not hide what is a demo.

## Script

### 0:00-0:15 The problem
**On screen:** a dashcam clip of a street, then the app home page with the event list.
**Say:**
"Self-driving cars need examples of risky moments. The most dangerous one is a person stepping onto the road in front of a moving car. These moments are rare. Our team found them in real dashcam video from Toronto."

### 0:15-0:45 A real event
**On screen:** open the top event. Play the clip. Show the person box, the danger score (80), then the driver-vs-model speed chart.
**Say:**
"We scanned 1,080 clips from the VAST archive. YOLO found 558 candidates. NVIDIA Cosmos and Nemotron judged the closest ones. Here is the top one. A woman steps onto the road ahead, outside any crosswalk. The danger score is 73 out of 100. One line is what the driver did, measured with optical flow. The other line is what the model suggests. Here the driver accelerated, and the model said stop. So the driver was less careful than the model."

### 0:45-0:55 Human label
**On screen:** click the "who was right?" buttons. Show the label saved.
**Say:**
"Now a person decides who was right: the driver or the model. Every answer is a labelled example. This is training data for the next version."

### 0:55-1:20 Scenario package and simulator (demo)
**On screen:** open the scenario view. Show the JSON (actors, speed profile). Click "Send to simulator". Show the export result.
**Say:**
"Each moment is also packaged as a scenario. It has the person's path, the car's speed and the danger score. The 'Send to simulator' button is a demo. No simulator is connected yet. The idea is to send the scenario to Cosmos or Omniverse, and make many variants: night, rain, a child, a faster car."

### 1:20-1:40 Write your own detector
**On screen:** Detectors page. Type: "A cyclist is riding close to the car." Click test on one clip. Show the result and the reason. Click run on the set.
**Say:**
"You are not limited to pedestrians. Write what you want to find, in plain words. Test it on one clip first. You see the answer and the reason in a few seconds. If it looks right, run it on the whole set."

### 1:40-2:00 The loop and why it matters
**On screen:** a simple loop: archive, detect, score, human label, scenario, simulator, better model. End on the app URL.
**Say:**
"This is a loop. Find a rare moment. Score it. Compare driver and model. Get a human label. Make a scenario. Train. It uses what NVIDIA and VAST already offer: Cosmos models, and a video archive that can be searched. One known weakness: some people on the sidewalk were counted as on the road. We are fixing it with a Nemotron vision check. Thank you."

## Shot list

1. Dashcam street clip (full screen, 3 s)
2. App home: event list
3. Event detail: clip with person box
4. Danger score close-up
5. Driver-vs-model speed chart
6. Feedback buttons clicked
7. Scenario JSON view
8. "Send to simulator" click and result (label it "demo" on screen)
9. Detector page: typing, test on one clip, result
10. Loop slide and app URL

## Recording tips

- Use a screen recorder (QuickTime, OBS or Loom). Record at 1080p.
- Close extra tabs. Hide notifications. Zoom the browser to 110% so text is readable.
- Open all pages before you start. Use a clip that loads fast.
- Rehearse once with a timer. Then record.
- Keep it under 2:10. If you run long, cut shots 4 and 10 first.
- Check the sound. Say the numbers slowly.
- Upload, then open the link in a private window to check it works.
- Put the link in `docs/submission.md` and in the form.

## Judging walkthrough

- **NVIDIA judge:** show first the event with Cosmos3-Reason's verdict and suggested action, then the Nemotron-3.5-Super-VL sidewalk check, then the scenario file made for a simulator.
- **VAST judge:** show first the 1,080-clip VSS archive, the stored YOLO boxes in VastDB, and the clips and thumbnails in S3 on VAST.
- **W&B judge:** show first the Nemotron calls through W&B Inference and the Weave traces of the Cosmos3-Reason and detector calls.
