import { useCallback, useEffect, useRef, useState } from 'react'
import { getRun, listDetectors, listEvents, mediaUrl, noVideo, startRun, type ApiEvent, type Detector, type Run } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge, StepError } from '@/components/detectors/common'
import { href } from '@/router'
import { StillFrame, mmss } from '@/components/events/shared'

function Match({ e }: { e: ApiEvent }) {
  const conf = Math.max(0, Math.min(100, e.danger))
  return (
    <Card className="gap-3 p-4">
      {noVideo(e) ? <StillFrame e={e} /> : <video controls muted playsInline preload="none" poster={mediaUrl(e.thumb_url)} src={mediaUrl(e.clip_url)} className="aspect-video w-full rounded-lg bg-black object-cover" />}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Match confidence</span>
          <span className="font-mono text-sm tabular-nums text-foreground">{conf}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${conf}%` }} /></div>
      </div>
      <p className="text-sm">{e.reason || 'No reason given.'}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{e.drive} · chunk {e.chunk} · {mmss(e.drive_time_sec)} into the drive</span>
        <a href={href({ page: 'event', id: e.id })} className="text-sm text-primary hover:underline">Details →</a>
      </div>
    </Card>
  )
}

export default function DetectorDetail({ id }: { id: string }) {
  const [d, setD] = useState<Detector | null>(null)
  const [items, setItems] = useState<ApiEvent[] | null>(null)
  const [err, setErr] = useState('')
  const [run, setRun] = useState<Run | null>(null)
  const [runErr, setRunErr] = useState<unknown>(null)
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(() => {
    listDetectors().then((all) => setD(all.find((x) => x.id === id) ?? null)).catch((x) => setErr(String(x.message ?? x)))
    listEvents({ detector_id: id, sort: 'danger_desc', limit: 200 }).then((p) => setItems(p.items)).catch((x) => setErr(String(x.message ?? x)))
  }, [id])

  useEffect(() => { setD(null); setItems(null); setErr(''); setRun(null); load() }, [load])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const rerun = async () => {
    setRunErr(null)
    try {
      const r = await startRun(id, { max_clips: 50 })
      setRun(r)
      const poll = async () => {
        const x = await getRun(r.run_id)
        setRun(x)
        if (x.status === 'running' || x.status === 'queued') timer.current = window.setTimeout(poll, 2000)
        else load()
      }
      timer.current = window.setTimeout(poll, 2000)
    } catch (x) { setRunErr(x) }   // keep the page; show why the run could not start
  }

  const back = <a href={href({ page: 'detectors' })} className="text-sm text-primary hover:underline">← All detectors</a>
  if (err) return <div className="space-y-3">{back}<p className="text-sm text-danger-high">Could not load this detector ({err}). Go back and pick another.</p></div>
  if (!d) return <div className="space-y-3">{back}<p className="text-sm text-muted-foreground">Loading detector…</p></div>

  const running = run && (run.status === 'running' || run.status === 'queued')
  return (
    <div className="space-y-6">
      {back}
      <Card className="gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={d.kind === 'builtin' ? 'secondary' : 'outline'} className="uppercase tracking-wide">{d.kind === 'builtin' ? 'Built-in' : 'Yours'}</Badge>
          <StatusBadge status={d.status} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{d.name}</h1>
        <blockquote className="border-l-2 border-primary/60 pl-3 text-sm text-foreground/90">{d.prompt}</blockquote>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span><span className="font-mono text-xl font-semibold tabular-nums text-foreground">{items?.length ?? d.event_count}</span> matches</span>
          {d.prefilter?.object_class && <span>Pre-filter: <b className="text-foreground">{d.prefilter.object_class}</b>{d.prefilter.in_lane ? ' in the car\'s lane' : ''}</span>}
          <span>Judge: NVIDIA Cosmos3-Reason</span>
          {d.kind === 'builtin'
            ? <a href={href({ page: 'events' })} className="text-primary hover:underline">Full details with scores and speed charts →</a>
            : <Button size="sm" variant="outline" onClick={rerun} disabled={!!running}>{running ? 'Running…' : 'Run again on the footage'}</Button>}
        </div>
        <StepError error={runErr} />
        {run && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${(run.progress.done / Math.max(1, run.progress.total)) * 100}%` }} /></div>
            <div className="font-mono text-xs tabular-nums text-muted-foreground">{run.progress.done} of {run.progress.total} clips · {run.matched} matched · {run.status}</div>
          </div>
        )}
      </Card>

      {!items && <p className="text-sm text-muted-foreground">Loading matches…</p>}
      {items && items.length === 0 && (
        <p className="text-sm text-muted-foreground">No matches yet. {d.kind === 'builtin' ? '' : 'Run it on the footage to find some.'}</p>
      )}
      {items && items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((e) => <Match key={e.id} e={e} />)}
        </div>
      )}
    </div>
  )
}
