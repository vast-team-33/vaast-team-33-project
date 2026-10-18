import { useEffect, useState } from 'react'
import { IS_ARCHIVE, getArchiveInfo } from '@/api/client'
import type { ClipSource } from '@/api/archive'

// "2:01.6": times in the original are given to a tenth of a second
const at = (s: number) => {
  const t = Math.round(s * 10) / 10
  const m = Math.floor(t / 60)
  return `${m}:${(t - 60 * m).toFixed(1).padStart(4, '0')}`
}

// Archive mode only: which public PIE video this event's clip was cut from. The link opens the original at that moment.
export default function OriginalVideo({ id }: { id: string }) {
  const [src, setSrc] = useState<ClipSource | null>(null)
  useEffect(() => {
    if (!IS_ARCHIVE) return
    getArchiveInfo()
      .then((m) => setSrc(m.sources?.[id] ?? null))
      .catch(() => {})
  }, [id])
  if (!src) return null
  return (
    <p className="text-xs text-muted-foreground">
      Original video:{' '}
      <a href={`${src.url}#t=${src.start_sec},${src.end_sec}`} target="_blank" rel="noopener" className="font-mono underline">
        {src.dataset} {src.file}
      </a>
      , {at(src.start_sec)} to {at(src.end_sec)}. From the public PIE dataset (York University, MIT License); the original is not blurred.
    </p>
  )
}
