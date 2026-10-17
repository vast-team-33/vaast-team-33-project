import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { exportScenario, type ExportResult, type ExportTarget, type Scenario } from '@/api/client'
import { cn } from '@/lib/utils'

// Simulator studio (demo): pick conditions, see variants of the real frame, then hand them to training.
// The previews are drawn in the browser on the real frame; no simulator or training job is connected.

type Opt = { id: string; label: string }
type Group = { id: string; label: string; visual?: boolean; opts: Opt[]; defaults: string[] }

const GROUPS: Group[] = [
  { id: 'weather', label: 'Weather', visual: true, defaults: ['clear', 'rain', 'snow'], opts: [
    { id: 'clear', label: 'Clear' }, { id: 'rain', label: 'Rain' }, { id: 'snow', label: 'Snow' },
    { id: 'fog', label: 'Fog' }, { id: 'flood', label: 'Flooded road' }] },
  { id: 'light', label: 'Light', visual: true, defaults: ['day', 'night'], opts: [
    { id: 'day', label: 'Day' }, { id: 'dusk', label: 'Dusk' }, { id: 'night', label: 'Night' }] },
  { id: 'ped', label: 'Pedestrian', defaults: ['adult'], opts: [
    { id: 'adult', label: 'As recorded' }, { id: 'child', label: 'A child' },
    { id: 'stroller', label: 'With a stroller' }, { id: 'running', label: 'Running' }] },
  { id: 'timing', label: 'Step-out timing', defaults: ['asis'], opts: [
    { id: 'asis', label: 'As recorded' }, { id: 'early', label: '1 s earlier' }, { id: 'late', label: '1 s later' }] },
  { id: 'speed', label: 'Car speed', defaults: ['asis'], opts: [
    { id: 'asis', label: 'As recorded' }, { id: 'plus20', label: '+20%' }, { id: 'minus20', label: '−20%' }] },
  { id: 'occl', label: 'Occlusion', defaults: ['none'], opts: [
    { id: 'none', label: 'None' }, { id: 'van', label: 'A parked van hides the pedestrian' }] },
]

const TRAIN_STEPS = [
  'Package the scenario',
  'Send to the simulator',
  'Generate the variants',
  'Add them to the training set',
  'Train the next model version',
  'Add them to the regression tests',
]

const label = (g: string, o: string) => GROUPS.find((x) => x.id === g)!.opts.find((x) => x.id === o)!.label

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Draw one variant of the real frame: lighting first, then weather. */
function drawVariant(c: HTMLCanvasElement, img: HTMLImageElement, weather: string, light: string, seed: number) {
  const ctx = c.getContext('2d')!
  const W = c.width, H = c.height, r = rng(seed)
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = weather === 'fog' ? 'blur(1.2px)' : 'none'
  ctx.drawImage(img, 0, 0, W, H)
  ctx.filter = 'none'

  if (light === 'dusk') {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, 'rgba(255,120,60,0.45)'); g.addColorStop(1, 'rgba(70,30,90,0.45)')
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  }
  if (light === 'night') {
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgb(62,78,132)'; ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'source-over'
    const g = ctx.createRadialGradient(W / 2, H * 1.05, 10, W / 2, H * 1.05, H * 0.75)
    g.addColorStop(0, 'rgba(255,240,200,0.55)'); g.addColorStop(1, 'rgba(255,240,200,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < 6; i++) {
      const x = r() * W, y = H * (0.35 + r() * 0.2)
      const s = ctx.createRadialGradient(x, y, 0, x, y, 18)
      s.addColorStop(0, 'rgba(255,220,150,0.8)'); s.addColorStop(1, 'rgba(255,220,150,0)')
      ctx.fillStyle = s; ctx.fillRect(x - 18, y - 18, 36, 36)
    }
  }
  ctx.globalCompositeOperation = 'source-over'

  if (weather === 'rain') {
    ctx.fillStyle = 'rgba(40,50,62,0.28)'; ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(205,215,235,0.55)'; ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < 420; i++) { const x = r() * (W + 40), y = r() * H; ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14) }
    ctx.stroke()
    const g = ctx.createLinearGradient(0, H * 0.7, 0, H)
    g.addColorStop(0, 'rgba(180,200,230,0)'); g.addColorStop(1, 'rgba(180,200,230,0.22)')
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.7, W, H * 0.3)
  }
  if (weather === 'snow') {
    ctx.fillStyle = 'rgba(235,240,248,0.22)'; ctx.fillRect(0, 0, W, H)
    const g = ctx.createLinearGradient(0, H * 0.72, 0, H)
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.6)')
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.72, W, H * 0.28)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 520; i++) { ctx.beginPath(); ctx.arc(r() * W, r() * H, 0.6 + r() * 1.9, 0, Math.PI * 2); ctx.fill() }
  }
  if (weather === 'fog') {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, 'rgba(225,228,232,0.35)'); g.addColorStop(0.5, 'rgba(225,228,232,0.7)'); g.addColorStop(1, 'rgba(225,228,232,0.4)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  }
  if (weather === 'flood') {
    const top = H * 0.74
    ctx.save()
    ctx.beginPath(); ctx.moveTo(0, H)
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, top + Math.sin(x / 23 + seed) * 2.5)
    ctx.lineTo(W, H); ctx.closePath(); ctx.clip()
    ctx.globalAlpha = 0.3
    ctx.translate(0, top * 2); ctx.scale(1, -1); ctx.drawImage(img, 0, 0, W, H)   // reflection
    ctx.restore()
    ctx.save()
    ctx.beginPath(); ctx.moveTo(0, H)
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, top + Math.sin(x / 23 + seed) * 2.5)
    ctx.lineTo(W, H); ctx.closePath()
    const g = ctx.createLinearGradient(0, top, 0, H)
    g.addColorStop(0, 'rgba(78,96,88,0.55)'); g.addColorStop(1, 'rgba(40,58,66,0.8)')
    ctx.fillStyle = g; ctx.fill()
    ctx.strokeStyle = 'rgba(230,240,240,0.35)'; ctx.lineWidth = 1
    for (let i = 0; i < 40; i++) { const x = r() * W, y = top + 6 + r() * (H - top - 6); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10 + r() * 20, y); ctx.stroke() }
    ctx.restore()
  }
}

function Tile({ img, weather, light, extras, seed, shown }: {
  img: HTMLImageElement | null; weather: string; light: string; extras: string; seed: number; shown: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (img && ref.current) drawVariant(ref.current, img, weather, light, seed) }, [img, weather, light, seed])
  return (
    <figure className={cn('overflow-hidden rounded-md border bg-black transition-opacity duration-500', shown ? 'opacity-100' : 'opacity-15')}>
      <canvas ref={ref} width={480} height={270} className="block aspect-video w-full" />
      <figcaption className="space-y-0.5 px-2 py-1.5 text-xs">
        <div className="font-medium">{label('weather', weather)} · {label('light', light)}</div>
        <div className="truncate text-muted-foreground">{extras}</div>
      </figcaption>
    </figure>
  )
}

export default function SimulatorStudio({ id, scenario, frameUrl }: { id: string; scenario: Scenario; frameUrl: string }) {
  const [sel, setSel] = useState<Record<string, string[]>>(() => Object.fromEntries(GROUPS.map((g) => [g.id, g.defaults])))
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [phase, setPhase] = useState<'config' | 'generating' | 'ready' | 'training' | 'done'>('config')
  const [made, setMade] = useState(0)
  const [trainStep, setTrainStep] = useState(0)
  const [target, setTarget] = useState<string>(scenario.targets[0]?.id ?? 'cosmos_transfer')
  const [exp, setExp] = useState<ExportResult | null>(null)

  useEffect(() => {
    const i = new Image()
    i.onload = () => setImg(i)
    i.src = frameUrl
  }, [frameUrl])

  const total = GROUPS.reduce((n, g) => n * Math.max(1, sel[g.id].length), 1)
  const tiles = useMemo(() => {
    const extras = GROUPS.filter((g) => !g.visual)
    const out: { weather: string; light: string; extras: string }[] = []
    let k = 0
    for (const w of sel.weather) for (const l of sel.light) {
      const parts = extras.map((g) => { const o = sel[g.id][k % sel[g.id].length]; return o === g.defaults[0] ? null : label(g.id, o) }).filter(Boolean)
      out.push({ weather: w, light: l, extras: parts.length ? parts.join(' · ') : 'pedestrian, timing and speed as recorded' })
      k++
    }
    return out.slice(0, 15)   // every weather × light pair, so each effect is visible
  }, [sel])

  const toggle = (g: string, o: string) => {
    if (phase === 'generating' || phase === 'training') return
    setPhase('config'); setMade(0); setExp(null); setTrainStep(0)
    setSel((s) => {
      const cur = s[g]
      const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]
      return { ...s, [g]: next.length ? next : cur }   // keep at least one option per group
    })
  }
  const selectAll = () => { setPhase('config'); setMade(0); setExp(null); setSel(Object.fromEntries(GROUPS.map((g) => [g.id, g.opts.map((o) => o.id)]))) }

  const generate = () => {
    setPhase('generating'); setMade(0)
    const start = performance.now(), dur = 2600
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur)
      setMade(Math.round(total * (1 - Math.pow(1 - p, 2))))
      if (p < 1) requestAnimationFrame(tick); else setPhase('ready')
    }
    requestAnimationFrame(tick)
  }

  const train = async () => {
    setPhase('training'); setTrainStep(0)
    try { setExp(await exportScenario(id, target as ExportTarget)) } catch { /* the demo walk-through continues without it */ }
    for (let s = 1; s <= TRAIN_STEPS.length; s++) { await new Promise((r) => setTimeout(r, 650)); setTrainStep(s) }
    setPhase('done')
  }

  const shownTiles = phase === 'config' ? tiles.length : Math.ceil((made / Math.max(1, total)) * tiles.length)

  return (
    <div className="space-y-4 rounded-lg border p-4" style={{ borderColor: 'color-mix(in oklch, var(--demo) 50%, transparent)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-transparent text-white" style={{ background: 'var(--demo)' }}>DEMO</Badge>
        <span className="text-sm font-medium">Simulator studio — visual preview, no simulator connected</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Pick the conditions to simulate around this real moment. The previews are drawn in your browser on the real frame to show the idea;
        a world model such as NVIDIA Cosmos Transfer would generate the actual clips.
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((g) => (
          <fieldset key={g.id} className="rounded-md border p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {g.opts.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={sel[g.id].includes(o.id)} onChange={() => toggle(g.id, o.id)} className="accent-[var(--primary)]" />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm">
          <span className="font-mono text-2xl font-semibold tabular-nums">{total.toLocaleString()}</span>
          <span className="ml-2 text-muted-foreground">variants of this one moment ({GROUPS.map((g) => sel[g.id].length).join(' × ')})</span>
        </div>
        <Button variant="outline" size="sm" onClick={selectAll} disabled={phase === 'generating' || phase === 'training'}>Select everything</Button>
        <Button onClick={generate} disabled={phase === 'generating' || phase === 'training'} className="ml-auto">
          {phase === 'generating' ? 'Simulating…' : `Simulate ${total.toLocaleString()} variants`}
        </Button>
      </div>

      {(phase === 'generating' || made > 0) && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-[var(--demo)] transition-[width]" style={{ width: `${(made / Math.max(1, total)) * 100}%` }} />
          </div>
          <div className="font-mono text-xs tabular-nums text-muted-foreground">{made.toLocaleString()} / {total.toLocaleString()} variants (demo)</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
        {tiles.map((t, i) => (
          <Tile key={`${t.weather}-${t.light}-${i}`} img={img} weather={t.weather} light={t.light} extras={t.extras} seed={i + 7} shown={i < shownTiles} />
        ))}
      </div>
      {total > tiles.length && <p className="text-xs text-muted-foreground">Showing {tiles.length} of {total.toLocaleString()} combinations.</p>}

      {(phase === 'ready' || phase === 'training' || phase === 'done') && (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Send to training</span>
            <select aria-label="Simulator" value={target} onChange={(e) => setTarget(e.target.value)} disabled={phase !== 'ready'} className="h-8 rounded-md border bg-background px-2 text-sm">
              {scenario.targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <Button size="sm" onClick={train} disabled={phase !== 'ready'}>{phase === 'ready' ? 'Send variants to training' : phase === 'training' ? 'Sending…' : 'Sent (demo)'}</Button>
          </div>
          {phase !== 'ready' && (
            <ol className="space-y-1 text-sm">
              {TRAIN_STEPS.map((s, i) => (
                <li key={s} className={cn('flex items-center gap-2', i < trainStep ? 'text-foreground' : 'text-muted-foreground')}>
                  <span className={cn('inline-block size-4 rounded-full border text-center text-[10px] leading-4', i < trainStep && 'border-transparent bg-[var(--demo)] text-white')}>{i < trainStep ? '✓' : ''}</span>
                  {s === 'Generate the variants' ? `Generate ${total.toLocaleString()} variants` : s}
                  <span className="text-xs text-muted-foreground">(demo)</span>
                </li>
              ))}
            </ol>
          )}
          {phase === 'done' && (
            <div className="rounded-md border p-3 text-sm" style={{ borderColor: 'var(--demo)' }}>
              <div className="mb-1 flex items-center gap-2">
                <Badge className="border-transparent text-white" style={{ background: 'var(--demo)' }}>DEMO</Badge>
                {exp && <span className="font-mono text-xs">{exp.export_id}</span>}
              </div>
              <p>
                One real moment became <b>{total.toLocaleString()}</b> training cases for the next model version, and the same cases join the regression
                tests so later versions must still handle them. In this demo nothing was sent: no simulator or training job is connected.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
