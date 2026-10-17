import { useEffect, useState } from 'react'
import { IS_MOCK, getSummary, listEvents, mediaUrl, type ApiEvent, type Summary } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const dangerColor = (d: number) => (d >= 60 ? 'bg-red-600' : d >= 30 ? 'bg-amber-500' : 'bg-green-600')

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [events, setEvents] = useState<ApiEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getSummary(), listEvents({ sort: 'danger_desc' })])
      .then(([s, e]) => {
        setSummary(s)
        setEvents(e.items)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const stats: [string, number | undefined][] = [
    ['Clips scanned', summary?.clips_scanned],
    ['Candidates', summary?.candidates],
    ['Events', summary?.events],
    ['Driver less careful', summary?.by_agreement?.driver_less_careful],
    ['Labels', summary?.feedback_count],
  ]

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Crossing Risk</h1>
        {IS_MOCK && <Badge variant="outline">mock data</Badge>}
      </header>
      {error && <p className="mb-4 text-destructive">API error: {error}</p>}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([label, v]) => (
          <Card key={label} className="gap-1 p-4">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="text-2xl font-semibold">{v ?? '-'}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => (
          <Card key={e.id} className="gap-3">
            <img src={mediaUrl(e.thumb_url)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
            <CardHeader className="flex-row items-center justify-between">
              <span className={cn('rounded px-2 py-0.5 text-sm font-bold text-white', dangerColor(e.danger))}>{e.danger}</span>
              <Badge variant="secondary">{e.crossing_location.replace(/_/g, ' ')}</Badge>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">{e.reason}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
