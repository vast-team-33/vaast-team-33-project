import { useEffect, useState } from 'react'

// Hash routes keep every URL relative, so the app works under /app/ without server rewrites.
export type Route =
  | { page: 'overview' }
  | { page: 'events' }
  | { page: 'event'; id: string }
  | { page: 'scenario'; id: string }
  | { page: 'detectors' }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'events' && parts[1] && parts[2] === 'scenario') return { page: 'scenario', id: parts[1] }
  if (parts[0] === 'events' && parts[1]) return { page: 'event', id: parts[1] }
  if (parts[0] === 'events') return { page: 'events' }
  if (parts[0] === 'detectors') return { page: 'detectors' }
  return { page: 'overview' }
}

export function href(route: Route): string {
  switch (route.page) {
    case 'overview': return '#/'
    case 'events': return '#/events'
    case 'event': return `#/events/${encodeURIComponent(route.id)}`
    case 'scenario': return `#/events/${encodeURIComponent(route.id)}/scenario`
    case 'detectors': return '#/detectors'
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => { setRoute(parseHash(window.location.hash)); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
