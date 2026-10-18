// Archive mode (VITE_ARCHIVE=1): a read-only static snapshot for GitHub Pages, no backend.
// Answers come from api/<path>.json next to the page (built by scripts/build_archive.py).
// listEvents filters, sorts and pages client-side with the same rules as list_events() in backend/server.py.
// Only imported dynamically from client.ts, so it is code-split out of the normal bundle.
import {
  ARCHIVE_OFFLINE,
  type ApiEvent, type Config, type Detections, type Detector, type EventParams, type EventsPage,
  type ExportResult, type ExportTarget, type Feedback, type FeedbackChoice, type Scenario, type Summary,
} from './client'

export interface ArchiveInfo {
  format: string
  captured_at: string
  captured_label: string
  events: number
  events_with_video: number
  detectors: number
  with_video: string[]
  with_detections: string[]
  excluded: string[]
  note?: string
}

const BUILTIN_ID = 'crossing_risk'

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

const cache = new Map<string, Promise<unknown>>()

/** GET a dumped response once per page load. Errors read like the live client's: "404 Not Found: events/x". */
function get<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(new URL(`api/${path}.json`, document.baseURI)).then((r) => {
      if (!r.ok) throw new HttpError(r.status, `${r.status} ${r.statusText}: ${path}`)
      return r.json()
    })
    p.catch(() => cache.delete(path))   // retry on the next call
    cache.set(path, p)
  }
  return p as Promise<T>
}

const enc = encodeURIComponent
const bad = (msg: string) => Promise.reject(new HttpError(400, `400 Bad Request: ${msg}`))
const offline = () => Promise.reject(new Error(ARCHIVE_OFFLINE))

// Labels given in this tab. Never persisted: the archive has no backend to save them to.
const session: Feedback[] = []

const latest = (e: ApiEvent): Feedback | null => {
  for (let i = session.length - 1; i >= 0; i--) if (session[i].event_id === e.id) return session[i]
  return e.feedback ?? null
}
const view = (e: ApiEvent): ApiEvent => ({ ...e, feedback: latest(e) })

export const getManifest = () => get<ArchiveInfo>('archive')

export const getSummary = async () => {
  const s = await get<Summary>('summary')
  return { ...s, feedback_count: s.feedback_count + session.length }
}

export const getConfig = () => get<Config>('config')

/** Same semantics as list_events() in backend/server.py. */
export async function listEvents(p: EventParams = {}): Promise<EventsPage> {
  // The server treats a missing or empty param as unset.
  const set = <V>(v: V | undefined | null | ''): v is V => v !== undefined && v !== null && v !== ''
  const did = set(p.detector_id) ? p.detector_id : undefined
  let all: ApiEvent[]
  if (did === undefined) {
    all = (await get<EventsPage>('events')).items
  } else {
    try {
      all = (await get<EventsPage>(`detectors/${enc(did)}/events`)).items
    } catch (x) {
      if (x instanceof HttpError && x.status === 404 && did !== BUILTIN_ID) all = []   // unknown detector: no matches
      else throw x
    }
  }
  let items = [...all]

  if (set(p.min_danger)) {
    const md = Number(p.min_danger)
    if (!Number.isInteger(md)) return bad('min_danger must be an integer')
    items = items.filter((e) => e.danger >= md)
  }
  const eq: [keyof ApiEvent, unknown][] = [
    ['agreement', p.agreement], ['crossing_location', p.crossing], ['pedestrian_position', p.position], ['drive', p.drive],
  ]
  for (const [key, v] of eq) if (set(v)) items = items.filter((e) => e[key] === v)
  if (set(p.has_feedback)) {
    const want = ['1', 'true', 'yes'].includes(String(p.has_feedback).toLowerCase())
    items = items.filter((e) => (latest(e) !== null) === want)
  }

  // Python compares tuples element by element and strings by code point; Array.sort is stable like sorted().
  const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0)
  const sort = set(p.sort) ? p.sort : 'danger_desc'
  if (sort === 'danger_desc') {
    items.sort((a, b) => cmp(b.danger, a.danger) || cmp(a.drive, b.drive) || cmp(a.drive_time_sec, b.drive_time_sec))
  } else if (sort === 'drive_time_asc') {
    items.sort((a, b) => cmp(a.drive, b.drive) || cmp(a.drive_time_sec, b.drive_time_sec))
  } else {
    return bad('sort must be danger_desc or drive_time_asc')
  }

  const int = (v: number | undefined, name: string, dflt: number, lo: number, hi = Infinity) => {
    if (!set(v)) return dflt
    const n = Number(v)
    if (!Number.isInteger(n)) throw new HttpError(400, `400 Bad Request: ${name} must be an integer`)
    return Math.min(hi, Math.max(lo, n))
  }
  const limit = int(p.limit, 'limit', 50, 0, 200)
  const offset = int(p.offset, 'offset', 0, 0)
  return { total: items.length, limit, offset, items: items.slice(offset, offset + limit).map(view) }
}

export const getEvent = async (id: string) => view(await get<ApiEvent>(`events/${enc(id)}`))

export async function getDetections(id: string): Promise<Detections> {
  const m = await getManifest().catch(() => null)
  // Skip the request when the manifest says there is nothing to fetch (keeps the console free of 404s).
  if (m && !m.with_detections.includes(id)) throw new HttpError(404, `404 Not Found: events/${id}/detections`)
  return get<Detections>(`events/${enc(id)}/detections`)
}

export const getScenario = (id: string) => get<Scenario>(`events/${enc(id)}/scenario`)

export async function postFeedback(id: string, choice: FeedbackChoice, note?: string): Promise<Feedback> {
  const [e, cfg, s] = await Promise.all([getEvent(id), getConfig(), get<Summary>('summary')])
  if (!cfg.feedback_choices.includes(choice)) return bad(`choice must be one of: ${cfg.feedback_choices.join(', ')}`)
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 500)) {
    return bad('note must be a string of at most 500 characters')
  }
  const fb: Feedback = {
    id: `fb_${String(s.feedback_count + session.length + 1).padStart(4, '0')}`,
    event_id: e.id,
    choice,
    created_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    ...(note ? { note } : {}),
  }
  session.push(fb)
  return fb
}

export async function exportScenario(id: string, target: ExportTarget): Promise<ExportResult> {
  const all = await get<Record<string, ExportResult>>(`events/${enc(id)}/export`)
  const r = all[target]
  if (!r) return bad('target must be one of: cosmos_transfer, omniverse, openscenario')
  return r
}

export const listDetectors = async () => (await get<{ items: Detector[] }>('detectors')).items

// Running or testing a detector needs the judge model on the lab GPUs.
export const createDetector = offline
export const previewDetector = offline
export const startRun = offline
export const getRun = offline
