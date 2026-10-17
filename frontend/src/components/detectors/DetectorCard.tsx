import { Badge } from '@/components/ui/badge'
import type { Detector } from '@/api/client'
import { StatusBadge } from './common'

export function DetectorCard({ d }: { d: Detector }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={d.kind === 'builtin' ? 'secondary' : 'outline'} className="uppercase tracking-wide">
          {d.kind === 'builtin' ? 'Built-in' : 'Yours'}
        </Badge>
        <StatusBadge status={d.status} />
      </div>
      <h3 className="font-medium">{d.name}</h3>
      <p className="line-clamp-2 text-sm text-muted-foreground">{d.prompt}</p>
      <p className="mt-auto pt-1 text-sm text-muted-foreground">
        <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{d.event_count}</span> events
      </p>
    </div>
  )
}
