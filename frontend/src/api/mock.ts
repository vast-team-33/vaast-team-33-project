// Mock mode (VITE_MOCK=1): answers come from ../../api/fixtures. Only imported dynamically from client.ts,
// so it (and the JSON) is code-split out of the normal bundle.
import summary from '../../../api/fixtures/summary.json'
import config from '../../../api/fixtures/config.json'
import events from '../../../api/fixtures/events.json'
import event from '../../../api/fixtures/event.json'
import detections from '../../../api/fixtures/detections.json'
import feedback from '../../../api/fixtures/feedback.json'
import scenario from '../../../api/fixtures/scenario.json'
import exportRes from '../../../api/fixtures/export.json'
import detectors from '../../../api/fixtures/detectors.json'
import detector from '../../../api/fixtures/detector.json'
import preview from '../../../api/fixtures/preview.json'
import run from '../../../api/fixtures/run.json'

export const mock = {
  summary, config, events, event, detections, feedback, scenario, exportRes, detectors, detector, preview, run,
}
