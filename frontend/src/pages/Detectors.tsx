import { useCallback, useEffect, useState } from 'react'
import { IS_ARCHIVE, listDetectors, type Detector } from '@/api/client'
import { DetectorCard } from '@/components/detectors/DetectorCard'
import { Wizard } from '@/components/detectors/Wizard'
import { ArchiveOffline, StepError } from '@/components/detectors/common'

export default function Detectors() {
  const [items, setItems] = useState<Detector[] | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [creating, setCreating] = useState(true)

  const load = useCallback(() => {
    listDetectors().then((d) => { setItems(Array.isArray(d) ? d : ((d as unknown as { items?: Detector[] }).items ?? [])); setErr(null) }).catch(setErr)
  }, [])
  useEffect(load, [load])

  const sorted = [...(items ?? [])].sort((a, b) => Number(b.kind === 'builtin') - Number(a.kind === 'builtin'))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Detectors</h1>
        <p className="text-sm text-muted-foreground">Describe what to look for in plain words. Test it on one clip, then run it over the footage.</p>
      </div>
      <StepError error={err} />
      {!items && !err && <p className="text-sm text-muted-foreground">Loading detectors…</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((d) => <DetectorCard key={d.id} d={d} />)}
        <button type="button" onClick={() => setCreating(true)} className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-4 text-muted-foreground hover:border-primary/50 hover:text-foreground">
          <span className="text-2xl leading-none">+</span>
          <span className="text-sm font-medium">New detector</span>
        </button>
      </div>
      {creating && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium">New detector</h2>
          {IS_ARCHIVE && <ArchiveOffline />}
          <Wizard onCreated={load} />
        </div>
      )}
    </div>
  )
}
