import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { exportScenario, type ExportResult, type ExportTarget, type Scenario } from '@/api/client'

export default function SendPanel({ id, scenario }: { id: string; scenario: Scenario }) {
  const [target, setTarget] = useState<string>(scenario.targets[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ExportResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const send = async () => {
    setBusy(true); setErr(null)
    try { setRes(await exportScenario(id, target as ExportTarget)) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: 'color-mix(in oklch, var(--demo) 50%, transparent)' }}>
      <div className="flex items-center gap-2">
        <Badge className="border-transparent text-white" style={{ background: 'var(--demo)' }}>DEMO</Badge>
        <span className="text-sm font-medium">Demo — no simulator connected</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Simulator target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {scenario.targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <Button onClick={send} disabled={busy || !target}>{busy ? 'Sending…' : 'Send to simulator'}</Button>
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {res && (
        <div className="space-y-1 rounded-md border bg-muted p-3 text-sm" style={{ borderColor: 'var(--demo)' }}>
          <div className="flex items-center gap-2">
            <Badge className="border-transparent text-white" style={{ background: 'var(--demo)' }}>DEMO</Badge>
            <span className="font-mono tabular-nums">{res.export_id}</span>
            <span className="text-muted-foreground">target {res.target}</span>
          </div>
          <p>{res.message}</p>
        </div>
      )}
    </div>
  )
}
