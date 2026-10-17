import { useEffect, useState } from 'react'
import { getSummary, mediaUrl, type Summary } from '@/api/client'
import { href } from '@/router'

const CARDS = [
  { t: 'Detect', d: 'YOLO finds people in every dashcam frame. A lane zone tells us who is stepping into our path.' },
  { t: 'Judge', d: 'NVIDIA Cosmos3-Reason and Nemotron VL read the moment and say how dangerous it was and why.' },
  { t: 'Compare', d: 'Measured speed of the driver against the speed the model suggests. Where they differ, we learn.' },
]

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="font-mono text-3xl font-semibold tabular-nums">{value ?? '-'}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}

export default function Overview() {
  const [s, setS] = useState<Summary>()
  const [err, setErr] = useState('')
  useEffect(() => { getSummary().then(setS).catch((e) => setErr(String(e.message ?? e))) }, [])

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-lg border border-border">
        <img src={mediaUrl('media/hero/dashcam_2.jpg')} alt="" className="absolute inset-0 size-full scale-105 object-cover blur-sm" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
        <div className="relative px-6 py-14 md:py-20">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Crossing Risk</h1>
          <p className="mt-4 max-w-2xl text-base text-foreground/90">
            We find pedestrians stepping into the road in real dashcam footage, score the danger, compare the driver with an AI model, and package each moment for simulator training.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={href({ page: 'events' })} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">See dangerous moments</a>
            <a href={href({ page: 'detectors' })} className="rounded-md border border-border bg-background/60 px-4 py-2 text-sm font-medium hover:bg-accent">Write your own detector</a>
          </div>
        </div>
      </section>

      <section>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Clips scanned" value={s?.clips_scanned} />
          <Stat label="Candidates" value={s?.candidates} />
          <Stat label="Events" value={s?.events} />
          <Stat label="Driver less careful" value={s ? (s.by_agreement?.driver_less_careful ?? 0) : undefined} />
          <Stat label="Labels" value={s?.feedback_count} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {err ? `Could not load numbers: ${err}. Reload to retry.` : `from the 17 Oct run on ${s?.source ?? 'Toronto dashcam footage'}`}
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">The whole idea: a self-training loop</h2>
          <a href="idea.html?theme=dark" target="_blank" rel="noopener" className="text-sm text-primary hover:underline">Open full screen ↗</a>
        </div>
        <p className="text-sm text-muted-foreground">Click a box or use the arrows to walk through the 10 steps. Solid boxes run today, hatched is a demo, dashed is next.</p>
        <iframe
          src="idea.html?theme=dark"
          title="The self-training loop for self-driving cars"
          className="h-[1500px] w-full rounded-lg border border-border bg-card lg:h-[760px]"
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">How it works</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {CARDS.map((c) => (
            <div key={c.t} className="rounded-lg border border-border bg-card p-4">
              <div className="text-sm font-semibold">{c.t}</div>
              <p className="mt-1 text-sm text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
        VAST Data VSS · VastDB · NVIDIA Cosmos · W&amp;B Inference
      </footer>
    </div>
  )
}
