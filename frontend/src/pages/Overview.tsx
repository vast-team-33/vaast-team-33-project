import { useEffect, useState } from 'react'
import { getSummary, type Summary } from '@/api/client'
import Hero from '@/components/overview/Hero'

const PILLARS = [
  { k: '01', t: 'Store it reliably', d: 'Fleet video lands on VAST: clips in S3, detections and search vectors in VastDB, ready at petabyte scale for training and for audits later.' },
  { k: '02', t: 'Find and check what matters', d: 'Search the archive, run built-in or plain-word detectors with NVIDIA Cosmos and Nemotron, and let a person confirm who was right: the driver or the model.' },
  { k: '03', t: 'Simulate and train', d: 'Each confirmed moment becomes a scenario package. A simulator multiplies it into many variants (demo) to train and regression-test the next model.' },
]

const CARDS = [
  { t: 'Detect', d: 'Stored YOLO boxes find a person in the lane ahead of the car. Today\'s built-in scenario: pedestrians on the road.' },
  { t: 'Judge', d: 'NVIDIA Cosmos3-Reason watches the clip; Nemotron VL checks the frame: road, crosswalk or sidewalk, and how risky.' },
  { t: 'Compare', d: 'The driver\'s measured speed against the speed the model suggests. Where they differ, the next model learns.' },
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
      <Hero />

      <section className="grid gap-3 md:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.k} className="rounded-lg border border-border bg-card p-5">
            <div className="font-mono text-xs text-primary">{p.k}</div>
            <div className="mt-1 text-base font-semibold">{p.t}</div>
            <p className="mt-1 text-sm text-muted-foreground">{p.d}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">This demo, on real fleet footage</h2>
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
        <h2 className="mb-3 text-lg font-medium">How today's built-in scenario works</h2>
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
