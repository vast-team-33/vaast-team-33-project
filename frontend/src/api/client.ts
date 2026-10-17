import type { components } from './types'

type S = components['schemas']
export type ApiEvent = S['Event']
export type Summary = S['Summary']
export type Config = S['Config']
export type Detections = S['Detections']
export type Feedback = S['Feedback']
export type FeedbackChoice = S['FeedbackChoice']
export type Scenario = S['Scenario']
export type Detector = S['Detector']
export type DetectorInput = S['DetectorInput']
export type PreviewResult = S['PreviewResult']
export type Run = S['Run']
export type ExportResult = S['Export']
export type ExportTarget = 'cosmos_transfer' | 'omniverse' | 'openscenario'

export interface EventsPage {
  total: number
  limit: number
  offset: number
  items: ApiEvent[]
}
export interface EventParams {
  min_danger?: number
  agreement?: S['Agreement']
  crossing?: S['CrossingLocation']
  position?: S['PedestrianPosition']
  drive?: string
  detector_id?: string
  has_feedback?: boolean
  sort?: 'danger_desc' | 'drive_time_asc'
  limit?: number
  offset?: number
}

export const IS_MOCK = import.meta.env.VITE_MOCK === '1'

// Relative to the page, never a leading slash (the app is served under a sub-path).
function url(path: string, params?: Record<string, unknown>): URL {
  const u = new URL(`api/${path}`, document.baseURI)
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== '') u.searchParams.set(k, String(v))
  return u
}

async function req<T>(path: string, init?: { method: string; body?: unknown }, params?: Record<string, unknown>): Promise<T> {
  const res = await fetch(url(path, params), {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`)
  return res.json() as Promise<T>
}

// Cast helper: fixtures are real API responses, so the cast is safe.
async function m<T>(pick: (x: Awaited<typeof import('./mock')>['mock']) => unknown): Promise<T> {
  return pick((await import('./mock')).mock) as T
}

export const getSummary = () => (IS_MOCK ? m<Summary>((x) => x.summary) : req<Summary>('summary'))
export const getConfig = () => (IS_MOCK ? m<Config>((x) => x.config) : req<Config>('config'))
export const listEvents = (p: EventParams = {}) =>
  IS_MOCK ? m<EventsPage>((x) => x.events) : req<EventsPage>('events', undefined, { ...p })
export const getEvent = (id: string) =>
  IS_MOCK ? m<ApiEvent>((x) => x.event) : req<ApiEvent>(`events/${encodeURIComponent(id)}`)
export const getDetections = (id: string) =>
  IS_MOCK ? m<Detections>((x) => x.detections) : req<Detections>(`events/${encodeURIComponent(id)}/detections`)
export const postFeedback = (id: string, choice: FeedbackChoice, note?: string) =>
  IS_MOCK
    ? m<Feedback>((x) => x.feedback)
    : req<Feedback>(`events/${encodeURIComponent(id)}/feedback`, { method: 'POST', body: { choice, note } })
export const getScenario = (id: string) =>
  IS_MOCK ? m<Scenario>((x) => x.scenario) : req<Scenario>(`events/${encodeURIComponent(id)}/scenario`)
export const exportScenario = (id: string, target: ExportTarget) =>
  IS_MOCK
    ? m<ExportResult>((x) => x.exportRes)
    : req<ExportResult>(`events/${encodeURIComponent(id)}/export`, { method: 'POST', body: { target } })
export const listDetectors = () =>
  IS_MOCK ? m<Detector[]>((x) => x.detectors) : req<Detector[]>('detectors')
export const createDetector = (d: DetectorInput) =>
  IS_MOCK ? m<Detector>((x) => x.detector) : req<Detector>('detectors', { method: 'POST', body: d })
export const previewDetector = (id: string, eventId?: string) =>
  IS_MOCK
    ? m<PreviewResult>((x) => x.preview)
    : req<PreviewResult>(`detectors/${encodeURIComponent(id)}/preview`, { method: 'POST', body: eventId ? { event_id: eventId } : {} })
export const startRun = (id: string, opts: { drives?: string[]; max_clips?: number } = {}) =>
  IS_MOCK
    ? m<Run>((x) => x.run)
    : req<Run>(`detectors/${encodeURIComponent(id)}/runs`, { method: 'POST', body: opts })
export const getRun = (runId: string) =>
  IS_MOCK ? m<Run>((x) => x.run) : req<Run>(`runs/${encodeURIComponent(runId)}`)

/** Media URLs from the API are relative (e.g. "media/thumbs/x.jpg"); use them as-is. */
export const mediaUrl = (u: string) => u
