import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type State = 'built' | 'demo' | 'roadmap'
const STEPS: { n: string; label: string; note: string; state: State }[] = [
  { n: '1', label: 'Real dashcam', note: 'Toronto drives', state: 'built' },
  { n: '2', label: 'Detect', note: 'YOLO + lane zone', state: 'built' },
  { n: '3', label: 'Score danger', note: '0-100', state: 'built' },
  { n: '4', label: 'Driver vs model', note: 'speed compared', state: 'built' },
  { n: '5', label: 'Human label', note: 'who was right?', state: 'built' },
  { n: '6', label: 'Scenario package', note: 'JSON for simulators', state: 'built' },
  { n: '7', label: 'Simulator', note: 'hand-off is simulated', state: 'demo' },
  { n: '8', label: 'Synthetic variants', note: 'night, rain, child', state: 'roadmap' },
  { n: '9', label: 'Train', note: 'on real + synthetic', state: 'roadmap' },
  { n: '10', label: 'Better model', note: 'feeds back to Detect', state: 'roadmap' },
]

const STYLE: Record<State, string> = {
  built: 'border-primary/60 bg-primary/10 border-solid',
  demo: 'border-demo/60 bg-demo/10 border-solid',
  roadmap: 'border-muted-foreground/40 bg-transparent border-dashed text-muted-foreground',
}

export default function LoopDiagram() {
  return (
    <div>
      <ol className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={s.n} className={cn('relative rounded-lg border p-3', STYLE[s.state])}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{s.n}</span>
              {s.state === 'demo' && (
                <span className="rounded-full border border-demo/40 bg-demo/15 px-2 text-xs font-medium uppercase tracking-wide text-demo">demo</span>
              )}
              {s.state === 'roadmap' && <span className="text-xs font-medium uppercase tracking-wide">roadmap</span>}
            </div>
            <div className="mt-1 text-sm font-medium">{s.label}</div>
            <div className="text-xs text-muted-foreground">{s.note}</div>
            {i < STEPS.length - 1 && i !== 4 && (
              <ArrowRight aria-hidden className="absolute -right-2.5 top-1/2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background text-muted-foreground md:block" />
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/40 px-3 py-2 text-xs text-muted-foreground">
        <span aria-hidden>&#8635;</span>
        Loop closes: the better model (10) goes back to Detect (2). Read left to right, row by row.
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <li className="flex items-center gap-2"><span className="size-3 rounded-sm border border-primary/60 bg-primary/10" />Built: runs today</li>
        <li className="flex items-center gap-2"><span className="size-3 rounded-sm border border-demo/60 bg-demo/10" />Demo: simulated hand-off, no simulator connected</li>
        <li className="flex items-center gap-2"><span className="size-3 rounded-sm border border-dashed border-muted-foreground/60" />Roadmap: not built yet</li>
      </ul>
    </div>
  )
}
