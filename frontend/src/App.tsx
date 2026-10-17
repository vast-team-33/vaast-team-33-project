import { IS_MOCK } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { APP_NAME } from '@/brand'
import { href, useRoute, type Route } from '@/router'
import Overview from '@/pages/Overview'
import Events from '@/pages/Events'
import EventDetail from '@/pages/EventDetail'
import Scenario from '@/pages/Scenario'
import Detectors from '@/pages/Detectors'

const NAV: { label: string; route: Route; match: Route['page'][] }[] = [
  { label: 'Overview', route: { page: 'overview' }, match: ['overview'] },
  { label: 'Events', route: { page: 'events' }, match: ['events', 'event', 'scenario'] },
  { label: 'Detectors', route: { page: 'detectors' }, match: ['detectors'] },
]

export default function App() {
  const route = useRoute()
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 py-3 md:px-8">
          <a href={href({ page: 'overview' })} className="flex items-center gap-2 text-lg font-bold tracking-tight"><span className="inline-block size-2.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />{APP_NAME}</a>
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={href(n.route)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm',
                  n.match.includes(route.page) ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {n.label}
              </a>
            ))}
          </nav>
          {IS_MOCK && <Badge variant="outline" className="ml-auto">mock data</Badge>}
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-8">
        {route.page === 'overview' && <Overview />}
        {route.page === 'events' && <Events />}
        {route.page === 'event' && <EventDetail id={route.id} />}
        {route.page === 'scenario' && <Scenario id={route.id} />}
        {route.page === 'detectors' && <Detectors />}
      </main>
    </div>
  )
}
