import { useEffect, useState, type ReactNode } from 'react'
import { getConfig, getDetections, listEvents, mediaUrl, type ApiEvent, type Config, type Detections } from '@/api/client'
import { href } from '@/router'
import { APP_NAME, TAGLINE } from '@/brand'
import { cn } from '@/lib/utils'

// Three hero layouts with the same message; pick one with ?hero=feed|full|wall (default feed).
// Every image is our own dashcam footage; the overlay is the stored YOLO detections for that frame.

type Feed = { e: ApiEvent; det: Detections | null; cfg: Config | null }

function useTopFeed(): Feed | null {
  const [f, setF] = useState<Feed | null>(null)
  useEffect(() => {
    listEvents({ sort: 'danger_desc', limit: 1 }).then(async ({ items }) => {
      const e = items[0]
      if (!e) return
      const [det, cfg] = await Promise.all([getDetections(e.id).catch(() => null), getConfig().catch(() => null)])
      setF({ e, det, cfg })
    }).catch(() => {})
  }, [])
  return f
}

/** Perception overlay in the 1920×1080 frame space: lane zone, every box, the in-lane person highlighted. */
function Perception({ f, faint }: { f: Feed; faint?: boolean }) {
  const frames = f.det?.frames ?? []
  const frame = frames.reduce<(typeof frames)[number] | null>((best, x) => (!best || Math.abs(x.t - f.e.peak_sec) < Math.abs(best.t - f.e.peak_sec) ? x : best), null)
  const lane = f.cfg?.lane_polygon ?? []
  return (
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" className={cn('absolute inset-0 size-full', faint && 'opacity-60')} aria-hidden>
      {lane.length > 2 && <polygon points={lane.map((p) => p.join(',')).join(' ')} fill="white" fillOpacity={0.07} stroke="white" strokeOpacity={0.55} strokeWidth={3} strokeDasharray="14 10" />}
      {frame?.boxes.map((b, i) => {
        const [x1, y1, x2, y2] = b.bbox
        const hot = b.in_lane && b.label === 'person'
        return (
          <g key={i}>
            <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="none" stroke={hot ? 'var(--danger-high)' : 'white'} strokeOpacity={hot ? 1 : 0.65} strokeWidth={hot ? 5 : 2.5} />
            {(hot || b.label !== 'person') && (
              <text x={x1} y={y1 - 10} fill={hot ? 'var(--danger-high)' : 'white'} fillOpacity={0.9} fontSize={26} fontFamily="ui-monospace, monospace">
                {b.label} {Math.round(b.confidence * 100)}%
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function Hud({ f }: { f: Feed }) {
  const frames = f.det?.frames ?? []
  const n = frames.length ? Math.max(...frames.map((x) => x.boxes.length)) : 0
  const people = frames.length ? Math.max(...frames.map((x) => x.boxes.filter((b) => b.label === 'person').length)) : 0
  const corner = 'absolute size-6 border-primary/80'
  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-[11px] uppercase tracking-wider text-white/85">
      <span className={cn(corner, 'left-3 top-3 border-l-2 border-t-2')} />
      <span className={cn(corner, 'right-3 top-3 border-r-2 border-t-2')} />
      <span className={cn(corner, 'bottom-3 left-3 border-b-2 border-l-2')} />
      <span className={cn(corner, 'bottom-3 right-3 border-b-2 border-r-2')} />
      <div className="absolute left-5 top-5 rounded bg-black/55 px-2 py-1">Front camera · {f.e.drive} · Toronto</div>
      <div className="absolute right-5 top-5 flex items-center gap-1.5 rounded bg-black/55 px-2 py-1"><span className="size-2 rounded-full bg-danger-high" />Rec · 30 fps</div>
      <div className="absolute bottom-5 left-5 rounded bg-black/55 px-2 py-1">{n} objects · {people} people · 1 in our lane</div>
      <div className="absolute bottom-5 right-5 rounded bg-black/55 px-2 py-1">YOLO11 boxes · stored on VAST</div>
    </div>
  )
}

function Copy({ center }: { center?: boolean }) {
  return (
    <div className={cn('space-y-5', center && 'mx-auto max-w-3xl text-center')}>
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Self-driving data engine · VAST Data + NVIDIA</div>
      <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">{TAGLINE}.</h1>
      <p className={cn('max-w-2xl text-base text-foreground/85 md:text-lg', center && 'mx-auto')}>
        Self-driving fleets record petabytes of camera video. {APP_NAME} keeps it on reliable VAST storage, finds the moments that matter
        with NVIDIA models, lets people check them, and turns each one into simulated training data for the next model.
      </p>
      <div className={cn('flex flex-wrap gap-3', center && 'justify-center')}>
        <a href={href({ page: 'events' })} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Explore detected moments</a>
        <a href={href({ page: 'detectors' })} className="rounded-md border border-border bg-background/60 px-4 py-2 text-sm font-medium hover:bg-accent">Write a detector</a>
      </div>
    </div>
  )
}

function Frame({ f, children, className }: { f: Feed | null; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden bg-black', className)}>
      {f && <img src={mediaUrl(f.e.thumb_url)} alt="What the car's front camera saw, with its detections" className="absolute inset-0 size-full object-cover" />}
      {children}
    </div>
  )
}

/** A: text on the left, the car's live-looking perception feed on the right. */
function HeroFeed() {
  const f = useTopFeed()
  return (
    <section className="grid items-center gap-8 rounded-xl border border-border bg-card/60 p-6 md:p-10 lg:grid-cols-[5fr_6fr]">
      <Copy />
      <Frame f={f} className="aspect-video rounded-lg ring-1 ring-primary/25">
        {f && <><Perception f={f} /><Hud f={f} /></>}
      </Frame>
    </section>
  )
}

/** B: the camera frame fills the hero, darkened, with the perception overlay behind the text. */
function HeroFull() {
  const f = useTopFeed()
  return (
    <section className="relative overflow-hidden rounded-xl border border-border">
      <Frame f={f} className="absolute inset-0">{f && <Perception f={f} faint />}</Frame>
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
      <div className="relative px-6 py-16 md:px-12 md:py-24"><div className="max-w-3xl"><Copy /></div></div>
    </section>
  )
}

/** C: a wall of real fleet frames behind the message, to show the scale of the data. */
function HeroWall() {
  const [thumbs, setThumbs] = useState<string[]>([])
  useEffect(() => { listEvents({ limit: 24 }).then(({ items }) => setThumbs(items.map((e) => e.thumb_url))).catch(() => {}) }, [])
  return (
    <section className="relative overflow-hidden rounded-xl border border-border">
      <div className="absolute inset-0 grid grid-cols-4 gap-1 opacity-60 md:grid-cols-6">
        {[...thumbs, ...thumbs].slice(0, 24).map((t, i) => <img key={i} src={mediaUrl(t)} alt="" className="aspect-video w-full object-cover" />)}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-background/75 via-background/80 to-background" />
      <div className="relative px-6 py-20 md:py-28"><Copy center /></div>
    </section>
  )
}

export default function Hero() {
  const v = new URLSearchParams(window.location.search).get('hero')
  if (v === 'full') return <HeroFull />
  if (v === 'wall') return <HeroWall />
  return <HeroFeed />
}
