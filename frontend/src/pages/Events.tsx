import { useEffect, useState } from 'react'
import { getSummary, listEvents, mediaUrl, type ApiEvent, type EventParams, type Summary } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { href } from '@/router'
import { ACTUAL, SUGGESTED, EventBadges, FeedbackBar, Legend, ScoreNumber, SpeedChart, mmss } from '@/components/events/shared'

const QUICK = [
  { key: 'all', label: 'All', p: {} as EventParams },
  { key: 'less', label: 'Driver less careful', p: { agreement: 'driver_less_careful' } as EventParams },
  { key: 'outside', label: 'Outside crosswalk', p: { crossing: 'outside_crosswalk' } as EventParams },
  { key: 'high', label: 'Danger ≥ 60', p: { min_danger: 60 } as EventParams },
]

const sel = 'h-8 rounded-md border bg-background px-2 text-sm'

function EventCard({ e }: { e: ApiEvent }) {
  const sec = (e.frames_in_lane / 30).toFixed(1)
  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ScoreNumber e={e} />
        <a href={href({ page: 'event', id: e.id })} className="text-sm text-primary hover:underline">Details →</a>
      </div>
      <video
        controls muted playsInline preload="none" poster={mediaUrl(e.thumb_url)} src={mediaUrl(e.clip_url)}
        className="aspect-video w-full rounded-lg bg-black object-cover"
      />
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
      <SpeedChart measured={e.speeds} suggested={e.suggested_speeds} sampleSec={0.2} height={70} peak={e.peak_sec} />
      <p className="text-sm">{e.reason}</p>
      <FeedbackBar e={e} compact />
      <div className="font-mono text-xs text-muted-foreground">
        {e.drive} · chunk {e.chunk} · {mmss(e.drive_time_sec)} into the drive · person in the lane for {sec} s
      </div>
    </Card>
  )
}

export default function Events() {
  const [quick, setQuick] = useState('all')
  const [extra, setExtra] = useState<EventParams>({})
  const [items, setItems] = useState<ApiEvent[] | null>(null)
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => { getSummary().then(setSummary).catch(() => {}) }, [])
  useEffect(() => {
    const p: EventParams = { ...QUICK.find((q) => q.key === quick)!.p, ...extra, sort: 'danger_desc', limit: 100 }
    setItems(null); setErr('')
    listEvents(p).then((r) => { setItems(r.items); setTotal(r.total) }).catch((x) => setErr(String(x.message ?? x)))
  }, [quick, extra])

  const set = (k: keyof EventParams, v: string) => setExtra((s) => ({ ...s, [k]: v === '' ? undefined : k === 'min_danger' ? Number(v) : v }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        {summary && (
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {summary.clips_scanned} clips scanned · {summary.candidates} with a person in the car&apos;s lane · {summary.events} judged ·{' '}
            {summary.by_agreement?.driver_less_careful ?? 0} where the driver was less careful · {summary.feedback_count} feedback labels
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground"><Legend /></p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {QUICK.map((q) => (
          <Button key={q.key} size="sm" variant={quick === q.key ? 'default' : 'outline'} onClick={() => setQuick(q.key)}>{q.label}</Button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-border md:block" />
        <select className={sel} aria-label="Agreement" onChange={(ev) => set('agreement', ev.target.value)}>
          <option value="">Any agreement</option>
          <option value="driver_less_careful">Driver less careful</option>
          <option value="driver_as_careful">Driver as careful</option>
          <option value="driver_more_careful">Driver more careful</option>
        </select>
        <select className={sel} aria-label="Crossing" onChange={(ev) => set('crossing', ev.target.value)}>
          <option value="">Any crossing</option>
          <option value="marked_crosswalk">Marked crosswalk</option>
          <option value="outside_crosswalk">Outside crosswalk</option>
          <option value="not_crossing">Not crossing</option>
          <option value="unclear">Unclear</option>
        </select>
        <select className={sel} aria-label="Position" onChange={(ev) => set('position', ev.target.value)}>
          <option value="">Any position</option>
          <option value="on_road">On road</option>
          <option value="on_crosswalk">On crosswalk</option>
          <option value="on_sidewalk_or_curb">Sidewalk or curb</option>
        </select>
        <input className={`${sel} w-24`} aria-label="Drive" placeholder="Drive" onChange={(ev) => set('drive', ev.target.value.trim())} />
        <select className={sel} aria-label="Min danger" onChange={(ev) => set('min_danger', ev.target.value)}>
          <option value="">Any danger</option>
          <option value="30">Danger ≥ 30</option>
          <option value="60">Danger ≥ 60</option>
          <option value="80">Danger ≥ 80</option>
        </select>
        {items && <span className="ml-auto font-mono text-xs text-muted-foreground">{items.length} of {total}</span>}
      </div>

      {err && <p className="text-sm text-danger-high">Could not load events ({err}). Reload to try again.</p>}
      {!items && !err && <p className="text-sm text-muted-foreground">Loading events…</p>}
      {items && items.length === 0 && <p className="text-sm text-muted-foreground">No events match these filters. Clear a filter to see more.</p>}
      {items && (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((e) => <EventCard key={e.id} e={e} />)}
        </div>
      )}
    </div>
  )
}
