import { useEffect, useRef, useState } from 'react'
import { getConfig, getDetections, getEvent, listDetectors, mediaUrl, noVideo, type ApiEvent, type Config, type Detections } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { href } from '@/router'
import { ACTUAL, NO_VIDEO, SUGGESTED, EventBadges, FeedbackBar, Legend, ScoreNumber, SpeedChart, mmss } from '@/components/events/shared'

const FACTORS: [keyof ApiEvent['factors'], string, string][] = [
  ['closeness', 'Closeness', 'How near the person is to the car (larger box means closer).'],
  ['exposure', 'Exposure', 'Share of the clip where the person stays in the car\'s lane.'],
  ['location', 'Location', 'Where the person is: road scores highest, sidewalk lowest.'],
  ['moving', 'Moving', 'Whether the car was moving (1) or nearly stopped (lower).'],
]

function Overlay({ det, cfg, t }: { det: Detections | null; cfg: Config | null; t: number }) {
  const poly = det?.lane_polygon ?? cfg?.lane_polygon
  let frame: Detections['frames'][number] | undefined
  if (det?.frames.length) {
    frame = det.frames.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a))
  }
  const W = det?.frame_w ?? cfg?.frame_w ?? 1920
  const H = det?.frame_h ?? cfg?.frame_h ?? 1080
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {poly && <polygon points={poly.map((p) => p.join(',')).join(' ')} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.6)" strokeWidth={2} />}
      {frame?.boxes.map((b, i) => {
        const [x1, y1, x2, y2] = b.bbox
        const hot = b.in_lane && b.label === 'person'
        return (
          <g key={i}>
            <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="none" strokeWidth={hot ? 4 : 2}
              className={hot ? 'stroke-danger-high' : ''} stroke={hot ? undefined : 'rgba(255,255,255,0.7)'} />
            {hot && <text x={x1} y={Math.max(30, y1 - 8)} fontSize={22} className="fill-danger-high" style={{ fontFamily: 'monospace' }}>person in lane {Math.round(b.confidence * 100)}%</text>}
          </g>
        )
      })}
    </svg>
  )
}

// Clips found by a plain-word detector carry the judge's match confidence, not a danger score
// (the backend stores it in `danger` as confidence × 100; newer backends also send match_confidence).
const isMatch = (e: ApiEvent) => !!e.detector_id && e.detector_id !== 'crossing_risk'
const matchPct = (e: ApiEvent) => {
  const c = (e as ApiEvent & { match_confidence?: number }).match_confidence
  return Math.round(c !== undefined ? c * 100 : e.danger)
}

function MatchCard({ e }: { e: ApiEvent }) {
  const [name, setName] = useState('')
  const [base, setBase] = useState<ApiEvent | null>(null)
  useEffect(() => {
    listDetectors().then((ds) => setName(ds.find((d) => d.id === e.detector_id)?.name ?? '')).catch(() => {})
    const baseId = e.id.split('__')[0]
    if (baseId !== e.id) getEvent(baseId).then(setBase).catch(() => setBase(null))
  }, [e])
  return (
    <Card className="gap-3 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Found by detector{' '}
        <a href={href({ page: 'detector', id: e.detector_id })} className="normal-case tracking-normal text-primary hover:underline">{name || e.detector_id}</a>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-5xl font-semibold tabular-nums text-primary">{matchPct(e)}%</span>
        <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">match confidence</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${matchPct(e)}%` }} /></div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Judge reason</div>
        <p className="text-sm">{e.reason}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        This is how sure the judge (NVIDIA Cosmos3-Reason) is that the clip matches the detector, not a danger score. The danger score,
        pedestrian position and driver-vs-model comparison come from the built-in pedestrian detector.
      </p>
      {base && <a href={href({ page: 'event', id: base.id })} className="text-sm text-primary hover:underline">This clip also has a built-in analysis: danger {base.danger} →</a>}
    </Card>
  )
}

export default function EventDetail({ id }: { id: string }) {
  const [e, setE] = useState<ApiEvent | null>(null)
  const [det, setDet] = useState<Detections | null>(null)
  const [cfg, setCfg] = useState<Config | null>(null)
  const [err, setErr] = useState('')
  const [t, setT] = useState(0)
  const [overlay, setOverlay] = useState(true)
  const vref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    setE(null); setDet(null); setErr('')
    getEvent(id).then(setE).catch((x) => setErr(String(x.message ?? x)))
    getDetections(id).then(setDet).catch(() => setDet(null))
    getConfig().then(setCfg).catch(() => {})
  }, [id])

  useEffect(() => {
    let raf = 0
    const tick = () => { if (vref.current) setT(vref.current.currentTime); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [e])

  const back = <a href={href({ page: 'events' })} className="text-sm text-primary hover:underline">← Back to events</a>
  if (err) return <div className="space-y-3">{back}<p className="text-sm text-danger-high">Could not load this event ({err}). Go back and pick another.</p></div>
  if (!e) return <div className="space-y-3">{back}<p className="text-sm text-muted-foreground">Loading event…</p></div>

  const sampleSec = cfg?.speed_sample_sec ?? 0.2
  const still = noVideo(e)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <Button asChild><a href={href({ page: 'scenario', id: e.id })}>Package as scenario →</a></Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-2">
          <div className="relative aspect-video overflow-hidden rounded-lg border bg-black">
            {still
              ? <img src={mediaUrl(e.thumb_url)} alt="Frame at the moment of closest approach" className="absolute inset-0 h-full w-full object-contain" />
              : <video ref={vref} controls muted playsInline preload="metadata" poster={mediaUrl(e.thumb_url)} src={mediaUrl(e.clip_url)} className="absolute inset-0 h-full w-full" />}
            {overlay && <Overlay det={det} cfg={cfg} t={still ? e.peak_sec : t} />}
          </div>
          {still && <p className="text-sm text-muted-foreground">{NO_VIDEO}</p>}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={overlay} onChange={(ev) => setOverlay(ev.target.checked)} /> Show overlay (lane and detections)
            {!det && <span className="text-xs">· detections unavailable, showing lane only</span>}
          </label>
          <div className="font-mono text-xs text-muted-foreground">
            {e.drive} · chunk {e.chunk} · {mmss(e.drive_time_sec)} into the drive · person in the lane for {(e.frames_in_lane / 30).toFixed(1)} s
          </div>
        </div>

        {isMatch(e) ? <MatchCard e={e} /> : <Card className="gap-3 p-4">
          <ScoreNumber e={e} big />
          <EventBadges e={e} />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">The driver did (measured)</div>
              <div className="font-medium">{ACTUAL[e.actual_action]}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Our model suggests</div>
              <div className="font-medium">{SUGGESTED[e.suggested_action]}</div>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Judge reason</div>
            <p className="text-sm">{e.reason}</p>
          </div>
        </Card>}
      </div>

      {e.speeds.length > 0 && <Card className="gap-3 p-4">
        <h2 className="text-lg font-medium">Speed over the 5 s clip</h2>
        <SpeedChart
          measured={e.speeds} suggested={e.suggested_speeds} sampleSec={sampleSec} height={180} peak={e.peak_sec} playhead={still ? undefined : t} axis
          onSeek={still ? undefined : (s) => { if (vref.current) vref.current.currentTime = s }}
        />
        <div className="text-xs text-muted-foreground">
          <Legend /> <span className="ml-3">Red dotted line: peak danger at {e.peak_sec} s. Relative speed, no unit.</span>
        </div>
      </Card>}

      {!isMatch(e) && <Card className="gap-3 p-4">
        <h2 className="text-lg font-medium">Score breakdown</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FACTORS.map(([k, name, why]) => (
            <div key={k} className="rounded-md border p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{name}</div>
              <div className="font-mono text-2xl font-semibold tabular-nums">{e.factors[k].toFixed(2)}</div>
              <p className="mt-1 text-xs text-muted-foreground">{why}</p>
            </div>
          ))}
        </div>
        {cfg?.score.formula && <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">danger = {cfg.score.formula}</pre>}
      </Card>}

      <Card className="gap-3 p-4">
        <h2 className="text-lg font-medium">Your label</h2>
        <FeedbackBar e={e} />
      </Card>
    </div>
  )
}
