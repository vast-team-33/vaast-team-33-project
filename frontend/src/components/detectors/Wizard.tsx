import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  IS_MOCK, createDetector, getRun, listEvents, mediaUrl, previewDetector, startRun,
  type ApiEvent, type Detector, type PreviewResult, type Run,
} from '@/api/client'
import { href } from '@/router'
import { DemoBadge, ProgressBar, Spinner, Step, StepError } from './common'

const CLASSES = ['person', 'bicycle', 'car', 'truck', 'bus', 'motorcycle']
const MAX = 800
const field = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function Wizard({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cls, setCls] = useState('')
  const [inLane, setInLane] = useState(false)
  const [det, setDet] = useState<Detector | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<Record<string, unknown>>({})
  const setE = (k: string, v: unknown) => setErr((e) => ({ ...e, [k]: v }))

  const [samples, setSamples] = useState<ApiEvent[]>([])
  const [pick, setPick] = useState<string | undefined>()
  const [preview, setPreview] = useState<PreviewResult | null>(null)

  const [run, setRun] = useState<Run | null>(null)
  const [matches, setMatches] = useState<ApiEvent[]>([])
  const alive = useRef(true)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; window.clearTimeout(timer.current) }
  }, [])
  useEffect(() => { listEvents({ limit: 12 }).then((p) => alive.current && setSamples(p.items.slice(0, 12))).catch(() => {}) }, [])

  const create = async () => {
    setBusy('create'); setE('create', null)
    try {
      const d = await createDetector({
        name: name.trim(), prompt: prompt.trim(),
        ...(cls || inLane ? { prefilter: { ...(cls ? { object_class: cls } : {}), in_lane: inLane } } : {}),
      })
      setDet(d); onCreated()
    } catch (e) { setE('create', e) } finally { setBusy(null) }
  }

  const test = async () => {
    if (!det) return
    setBusy('preview'); setE('preview', null); setPreview(null)
    try { setPreview(await previewDetector(det.id, pick)) } catch (e) { setE('preview', e) } finally { setBusy(null) }
  }

  const loadMatches = async (id: string) => {
    try { const p = await listEvents({ detector_id: id }); if (alive.current) setMatches(p.items) } catch (e) { setE('run', e) }
  }

  const poll = (runId: string, detId: string) => {
    timer.current = window.setTimeout(async () => {
      try {
        let r = await getRun(runId)
        if (!alive.current) return
        // Mock mode serves one static run: treat it as finished after the first poll.
        if (IS_MOCK) r = { ...r, status: 'completed', progress: { done: r.progress.total, total: r.progress.total } }
        setRun(r)
        if (r.status === 'completed' || r.status === 'failed') {
          setBusy(null)
          if (r.status === 'completed') loadMatches(detId)
        } else poll(runId, detId)
      } catch (e) { setE('run', e); setBusy(null) }
    }, 2000)
  }

  const start = async () => {
    if (!det) return
    setBusy('run'); setE('run', null); setRun(null); setMatches([])
    try {
      const r = await startRun(det.id, { max_clips: 50 })
      setRun(r); poll(r.run_id, det.id)
    } catch (e) { setE('run', e); setBusy(null) }
  }

  const valid = name.trim().length > 0 && prompt.trim().length > 0 && prompt.length <= MAX
  const finished = run?.status === 'completed'
  const thumb = samples.find((s) => s.id === (preview?.sample_event_id ?? pick))

  return (
    <div className="space-y-4">
      <Step n={1} title="Write" active={!det} done={!!det}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</span>
            <input className={field} value={name} maxLength={80} disabled={!!det} onChange={(e) => setName(e.target.value)} placeholder="Cyclist close to the car" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prefilter (optional)</span>
              <select className={field} value={cls} disabled={!!det} onChange={(e) => setCls(e.target.value)}>
                <option value="">Any object</option>
                {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={inLane} disabled={!!det} onChange={(e) => setInLane(e.target.checked)} />
              only in the car's lane
            </label>
          </div>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="flex justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Prompt
              <span className={`font-mono tabular-nums ${prompt.length > MAX ? 'text-destructive' : ''}`}>{prompt.length}/{MAX}</span>
            </span>
            <textarea className={field} rows={3} value={prompt} disabled={!!det} onChange={(e) => setPrompt(e.target.value)} placeholder="A cyclist is riding close to the ego car." />
          </label>
        </div>
        <div className="mt-3 space-y-2">
          <StepError error={err.create} />
          {!det && <Button disabled={!valid || busy === 'create'} onClick={create}>{busy === 'create' ? 'Saving…' : 'Save detector'}</Button>}
          {det && <p className="text-sm text-muted-foreground">Saved as <span className="font-mono">{det.id}</span>.</p>}
        </div>
      </Step>

      <Step n={2} title="Test on one clip" active={!!det && !preview} done={!!preview}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          <button type="button" onClick={() => setPick(undefined)} className={`flex aspect-video items-center justify-center rounded-md border p-1 text-center text-xs ${!pick ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
            Let the backend pick
          </button>
          {samples.map((s) => (
            <button type="button" key={s.id} onClick={() => setPick(s.id)} className={`overflow-hidden rounded-md border ${pick === s.id ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}>
              <img src={mediaUrl(s.thumb_url)} alt={`Clip ${s.drive} ${s.drive_time_sec}`} className="aspect-video w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-3">
          <Button disabled={!det || busy === 'preview'} onClick={test}>Test it</Button>
          {busy === 'preview' && <Spinner label="Asking the model… about 6 s on a shared NVIDIA GPU" />}
          <StepError error={err.preview} />
          {preview && (
            <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[200px_1fr]">
              {thumb ? <img src={mediaUrl(thumb.thumb_url)} alt="Tested clip" className="aspect-video w-full rounded-md object-cover" /> : (
                <div className="flex aspect-video items-center justify-center rounded-md bg-muted font-mono text-xs text-muted-foreground">{preview.sample_event_id.slice(-24)}</div>
              )}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={preview.result.match ? 'default' : 'outline'} className="uppercase tracking-wide">{preview.result.match ? 'Match: yes' : 'Match: no'}</Badge>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {preview.result.moment_sec != null ? `at ${preview.result.moment_sec.toFixed(1)} s` : 'no moment'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Confidence</span>
                  <div className="h-2 w-40 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(preview.result.confidence * 100)}%` }} /></div>
                  <span className="font-mono text-xs tabular-nums">{Math.round(preview.result.confidence * 100)}%</span>
                </div>
                <p>{preview.result.reason}</p>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">{(preview.latency_ms / 1000).toFixed(1)} s · {preview.model}</p>
              </div>
            </div>
          )}
        </div>
      </Step>

      <Step n={3} title="Run on the footage" active={!!preview && !finished} done={!!finished}>
        <div className="space-y-3">
          <Button disabled={!det || busy === 'run'} onClick={start}>{busy === 'run' ? 'Running…' : 'Run on up to 50 clips'}</Button>
          <StepError error={err.run} />
          {run && (
            <div className="space-y-2">
              <ProgressBar done={run.progress.done} total={run.progress.total} />
              <p className="text-sm text-muted-foreground">
                <span className="font-mono tabular-nums text-foreground">{run.matched}</span> matched · {run.status}
                {run.status === 'failed' && run.error ? `: ${run.error}` : ''}
              </p>
            </div>
          )}
          {finished && matches.length === 0 && <p className="text-sm text-muted-foreground">No matches yet. Try a broader prompt.</p>}
          {matches.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {matches.map((ev) => (
                <a key={ev.id} href={href({ page: 'event', id: ev.id })} className="overflow-hidden rounded-lg border border-border bg-card hover:border-primary/50">
                  <img src={mediaUrl(ev.thumb_url)} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                  <p className="line-clamp-2 p-2 text-xs text-muted-foreground">{ev.reason}</p>
                </a>
              ))}
            </div>
          )}
        </div>
      </Step>

      <Step n={4} title="Send to simulator" active={!!finished} done={false}>
        <div className="space-y-2 rounded-lg border border-demo/40 bg-demo/5 p-3">
          <div className="flex items-center gap-2"><DemoBadge /><span className="text-sm font-medium">Demo — no simulator connected</span></div>
          <p className="text-sm text-muted-foreground">Demo: sending is simulated. Open a matched event to preview its scenario.</p>
          <Button variant="outline" disabled>Send matches (demo)</Button>
        </div>
      </Step>
    </div>
  )
}
