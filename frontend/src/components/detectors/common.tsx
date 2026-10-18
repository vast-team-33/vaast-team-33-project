import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { ARCHIVE_OFFLINE } from '@/api/client'

export const is501 = (e: unknown) => e instanceof Error && e.message.startsWith('501')

export function NotLive() {
  return (
    <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      This step is not live yet on the server. You can keep going with the other steps.
    </p>
  )
}

/** Archive mode: the lab GPUs are gone, so this is a fact to state, not an error to retry. */
export function ArchiveOffline() {
  return (
    <p className="rounded-md border border-demo/40 bg-demo/15 px-3 py-2 text-sm text-demo">{ARCHIVE_OFFLINE}</p>
  )
}

export function StepError({ error }: { error: unknown }) {
  if (!error) return null
  if (is501(error)) return <NotLive />
  if (error instanceof Error && error.message === ARCHIVE_OFFLINE) return <ArchiveOffline />
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error instanceof Error ? error.message : 'Something went wrong.'} Try again.
    </p>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
      {label}
    </div>
  )
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{done} of {total} clips</span>
    </div>
  )
}

export function DemoBadge() {
  return <Badge className="border-demo/40 bg-demo/15 uppercase tracking-wide text-demo">demo</Badge>
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className="uppercase tracking-wide">{status}</Badge>
}

export function Step({ n, title, active, done, children }: { n: number; title: string; active: boolean; done: boolean; children: ReactNode }) {
  return (
    <section className={`rounded-lg border p-4 ${active ? 'border-primary/50 bg-card' : 'border-border bg-card/50'}`}>
      <h3 className="mb-3 flex items-center gap-3 text-lg font-medium">
        <span className={`flex size-6 items-center justify-center rounded-full border font-mono text-xs ${done ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>{n}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}
