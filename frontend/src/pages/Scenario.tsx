import { useEffect, useState, type ReactNode } from 'react'
import { getEvent, getScenario, mediaUrl, type ApiEvent, type Scenario as ScenarioT } from '@/api/client'
import { href } from '@/router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import SpeedChart from '@/components/scenario/SpeedChart'
import CopyBlock from '@/components/scenario/CopyBlock'
import SendPanel from '@/components/scenario/SendPanel'

const band = (d: number) => (d >= 60 ? 'var(--danger-high)' : d >= 30 ? 'var(--danger-mid)' : 'var(--danger-low)')
const human = (s: string) => s.replace(/_/g, ' ')

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

function download(s: ScenarioT) {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' })
  const u = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = u
  a.download = `${s.scenario_id}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(u)
}

export default function Scenario({ id }: { id: string }) {
  const [ev, setEv] = useState<ApiEvent | null>(null)
  const [sc, setSc] = useState<ScenarioT | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setEv(null); setSc(null); setErr(null)
    Promise.all([getEvent(id), getScenario(id)])
      .then(([e, s]) => { setEv(e); setSc(s) })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }, [id])

  if (err) return <p role="alert" className="text-destructive">Could not load scenario: {err}</p>
  if (!sc || !ev) return <p className="text-muted-foreground">Loading scenario…</p>

  return (
    <div className="space-y-4">
      <a href={href({ page: 'event', id })} className="text-sm text-primary hover:underline">← Back to event</a>
      <header className="flex flex-wrap items-start gap-4">
        {ev.thumb_url && <img src={mediaUrl(ev.thumb_url)} alt="Event thumbnail" className="h-28 rounded-md border object-cover" />}
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold">Scenario package</h1>
          <p className="text-muted-foreground">{sc.summary}</p>
          <p className="font-mono text-xs text-muted-foreground">{sc.scenario_id} · {sc.format}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-4xl font-semibold tabular-nums" style={{ color: band(sc.danger) }}>{sc.danger}</div>
          <Badge variant="outline">danger score</Badge>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Actors">
          {sc.actors.map((a, i) => (
            <dl key={i} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Type</dt><dd>{a.type}</dd>
              <dt className="text-muted-foreground">Position</dt><dd>{human(a.position ?? "unknown")}</dd>
              <dt className="text-muted-foreground">Crossing</dt><dd>{human(a.crossing_location ?? "unknown")}</dd>
              <dt className="text-muted-foreground">Track points</dt><dd className="font-mono tabular-nums">{(a.image_track ?? []).length}</dd>
            </dl>
          ))}
        </Section>
        <Section title="Environment">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {Object.entries(sc.environment).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-muted-foreground">{human(k)}</dt><dd>{String(v)}</dd></div>
            ))}
          </dl>
        </Section>
      </div>

      <Section title="Ego car">
        <div className="flex flex-wrap gap-6 text-sm">
          <div><div className="text-muted-foreground">Actual</div><div className="text-lg font-medium">{human(sc.ego.actual_action ?? "unknown")}</div></div>
          <div><div className="text-muted-foreground">Suggested</div><div className="text-lg font-medium">{human(sc.ego.suggested_action ?? "unknown")}</div></div>
        </div>
        <SpeedChart measured={sc.ego.speed_profile_rel ?? []} suggested={sc.ego.suggested_speed_profile_rel ?? []} step={sc.ego.speed_sample_sec ?? 0.2} />
      </Section>

      <Section title="Suggested variations">
        <div className="flex flex-wrap gap-2">
          {sc.variations.map((v) => <Badge key={v} variant="secondary">{v}</Badge>)}
        </div>
      </Section>

      <Section title="Generation prompt">
        <CopyBlock text={sc.generation_prompt} />
      </Section>

      <Section title="Hand-off">
        <div className="space-y-4">
          <Button variant="outline" onClick={() => download(sc)}>Download scenario JSON</Button>
          <SendPanel id={id} scenario={sc} />
        </div>
      </Section>

      <p className="text-sm text-muted-foreground">
        What happens next (roadmap): the simulator generates synthetic variants of this moment; they are used to retrain the driving model.
      </p>
    </div>
  )
}
