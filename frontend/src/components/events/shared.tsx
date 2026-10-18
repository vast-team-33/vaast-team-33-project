import { useState } from 'react'
import { IS_ARCHIVE, mediaUrl, postFeedback, type ApiEvent, type Feedback, type FeedbackChoice } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const band = (d: number) => (d >= 60 ? 'high' : d >= 30 ? 'mid' : 'low') as 'high' | 'mid' | 'low'
export const BAND_WORD = { high: 'High', mid: 'Medium', low: 'Low' }
export const BAND_TINT = {
  high: 'bg-danger-high/15 text-danger-high border-danger-high/40',
  mid: 'bg-danger-mid/15 text-danger-mid border-danger-mid/40',
  low: 'bg-danger-low/15 text-danger-low border-danger-low/40',
}
export const BAND_TEXT = { high: 'text-danger-high', mid: 'text-danger-mid', low: 'text-danger-low' }

export const POSITION: Record<string, string> = {
  on_road: 'On road', on_crosswalk: 'On crosswalk', on_sidewalk_or_curb: 'Sidewalk or curb', none: 'No pedestrian',
}
export const CROSSING: Record<string, string> = {
  marked_crosswalk: 'Marked crosswalk', outside_crosswalk: 'Outside crosswalk', not_crossing: 'Not crossing', unclear: 'Crossing unclear',
}
export const AGREEMENT: Record<string, string> = {
  driver_less_careful: 'Driver less careful than model',
  driver_as_careful: 'Driver as careful as model',
  driver_more_careful: 'Driver more careful than model',
  unknown: 'Agreement unknown',
}
export const ACTUAL: Record<string, string> = {
  kept_speed: 'Kept speed', slowed_down: 'Slowed down', stopped: 'Stopped', was_stopped: 'Was already stopped', accelerated: 'Accelerated', unknown: 'Unknown',
}
export const SUGGESTED: Record<string, string> = {
  stop: 'Stop', slow_down: 'Slow down', proceed_with_caution: 'Proceed with caution', proceed: 'Proceed', unknown: 'Unknown',
}
export const CHOICE: Record<string, string> = {
  driver_right: 'Driver was right', model_right: 'Model was right', both_fine: 'Both fine', false_alarm: 'False alarm',
}
const SHORT: Record<string, string> = { driver_right: 'Driver', model_right: 'Model', both_fine: 'Both fine', false_alarm: 'False alarm' }

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

const RED = 'bg-danger-high/15 text-danger-high border-danger-high/40'

// Archive mode: the snapshot holds video for only a few events (see noVideo in api/client).
export const NO_VIDEO = 'Video not included in this archive.'

/** Stand-in for a card's video when the archive has no clip: the thumbnail plus one line saying so. */
export function StillFrame({ e }: { e: ApiEvent }) {
  return (
    <div className="space-y-1">
      <img src={mediaUrl(e.thumb_url)} alt="Frame at the moment of closest approach" loading="lazy" className="aspect-video w-full rounded-lg bg-black object-cover" />
      <p className="text-xs text-muted-foreground">{NO_VIDEO}</p>
    </div>
  )
}

export function EventBadges({ e }: { e: ApiEvent }) {
  const riskTint = e.risk === 'high' ? BAND_TINT.high : e.risk === 'medium' ? BAND_TINT.mid : e.risk === 'low' ? BAND_TINT.low : ''
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline" className={e.pedestrian_position === 'on_road' ? RED : ''}>{POSITION[e.pedestrian_position]}</Badge>
      <Badge variant="outline" className={e.crossing_location === 'outside_crosswalk' ? RED : ''}>{CROSSING[e.crossing_location]}</Badge>
      <Badge variant="outline" className={riskTint}>Risk: {e.risk}</Badge>
      <Badge variant="outline" className={e.agreement === 'driver_less_careful' ? cn(RED, 'font-semibold') : ''}>
        {AGREEMENT[e.agreement]}
      </Badge>
    </div>
  )
}

export function ScoreNumber({ e, big }: { e: ApiEvent; big?: boolean }) {
  const b = band(e.danger)
  const f = e.factors
  const tip = `closeness ${f.closeness} · exposure ${f.exposure} · location ${f.location} · moving ${f.moving}`
  return (
    <div title={tip} className={cn('flex items-baseline gap-2', BAND_TEXT[b])}>
      <span className={cn('font-mono font-semibold tabular-nums leading-none', big ? 'text-5xl' : 'text-4xl')}>{e.danger}</span>
      <span className="text-xs font-medium uppercase tracking-wide">{BAND_WORD[b]} danger</span>
    </div>
  )
}

/** Hand-rolled speed chart. `height` in px; `peak` marks peak_sec; `playhead` in seconds; `onSeek` makes it clickable. */
export function SpeedChart({
  measured, suggested, sampleSec, height = 70, peak, playhead, axis, onSeek,
}: {
  measured: number[]; suggested: number[]; sampleSec: number; height?: number; peak?: number; playhead?: number; axis?: boolean
  onSeek?: (sec: number) => void
}) {
  const W = 400, H = 100
  const max = Math.max(0.01, ...measured, ...suggested) * 1.1
  const dur = Math.max(measured.length, suggested.length, 2) * sampleSec
  const x = (s: number) => Math.min(W, (s / dur) * W)
  const y = (v: number) => H - (v / max) * H
  const pts = (a: number[]) => a.map((v, i) => `${x(i * sampleSec)},${y(v)}`).join(' ')
  const ticks = Array.from({ length: Math.floor(dur) + 1 }, (_, i) => i)
  const line = { vectorEffect: 'non-scaling-stroke' as const }
  // Measured speed under the playhead, interpolated between samples.
  const at = (s: number) => {
    const f = Math.min(measured.length - 1, Math.max(0, s / sampleSec))
    const i = Math.floor(f), j = Math.min(measured.length - 1, i + 1)
    return measured[i] + (measured[j] - measured[i]) * (f - i)
  }
  const seek = (ev: React.MouseEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    onSeek?.(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * dur)
  }
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} onClick={onSeek ? seek : undefined}
        className={cn('w-full rounded-md bg-muted/40', onSeek && 'cursor-pointer')}
        aria-label={onSeek ? 'Speed chart: click to jump the video to that moment' : 'Speed chart'}
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} className="stroke-border" strokeWidth={1} {...line} />
        ))}
        {axis && ticks.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={H} className="stroke-border" strokeWidth={1} {...line} />
        ))}
        {peak !== undefined && (
          <line x1={x(peak)} x2={x(peak)} y1={0} y2={H} className="stroke-danger-high" strokeWidth={1.5} strokeDasharray="2 3" {...line} />
        )}
        <polyline points={pts(suggested)} fill="none" className="stroke-speed-suggested" strokeWidth={2} strokeDasharray="6 4" {...line} />
        <polyline points={pts(measured)} fill="none" className="stroke-speed-measured" strokeWidth={2} {...line} />
        {playhead !== undefined && measured.length > 0 && (
          <>
            <line x1={x(playhead)} x2={x(playhead)} y1={0} y2={H} className="stroke-foreground" strokeWidth={1.5} {...line} />
            <circle cx={x(playhead)} cy={y(at(playhead))} r={3.5} className="fill-speed-measured stroke-foreground" strokeWidth={1.5} {...line} />
          </>
        )}
      </svg>
      {axis && (
        <div className="relative mt-1 h-4 font-mono text-[11px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(x(t) / W) * 100}%` }}>{t}s</span>
          ))}
        </div>
      )}
    </div>
  )
}

export function Legend() {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" className="stroke-speed-measured" strokeWidth="2" /></svg>
        measured speed (what the driver did)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" className="stroke-speed-suggested" strokeWidth="2" strokeDasharray="6 4" /></svg>
        suggested speed (our model)
      </span>
    </span>
  )
}

export function FeedbackBar({ e, compact }: { e: ApiEvent; compact?: boolean }) {
  const [saved, setSaved] = useState<Feedback | null>(e.feedback)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [err, setErr] = useState('')
  async function send(c: FeedbackChoice) {
    setBusy(true); setErr('')
    try {
      const f = await postFeedback(e.id, c)
      setSaved(f); setFlash(true); setTimeout(() => setFlash(false), 2000)
    } catch (x) { setErr(x instanceof Error ? x.message : 'Could not save, try again') }
    setBusy(false)
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={compact ? 'text-xs text-muted-foreground' : 'text-sm font-medium'}>Who was right?</span>
        {(['driver_right', 'model_right', 'both_fine', 'false_alarm'] as FeedbackChoice[]).map((c) => (
          <Button key={c} size="sm" disabled={busy} variant={saved?.choice === c ? 'default' : 'outline'} onClick={() => send(c)}>
            {compact ? SHORT[c] : CHOICE[c]}
          </Button>
        ))}
        {flash && <span className="text-xs text-muted-foreground">{IS_ARCHIVE ? 'Kept until you reload (archived demo)' : 'Saved'}</span>}
      </div>
      {saved && <div className="text-xs text-muted-foreground">Labelled: <span className="font-medium text-foreground">{CHOICE[saved.choice]}</span></div>}
      {err && <div className="text-xs text-danger-high">{err}</div>}
    </div>
  )
}
