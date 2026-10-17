// Measured (solid) vs suggested (dashed) relative speed over the moment.
export default function SpeedChart({ measured, suggested, step }: { measured: number[]; suggested: number[]; step: number }) {
  const W = 480, H = 140, P = 24
  const n = Math.max(measured.length, suggested.length, 2)
  const max = Math.max(1, ...measured, ...suggested)
  const pts = (a: number[]) =>
    a.map((v, i) => `${(P + (i / (n - 1)) * (W - 2 * P)).toFixed(1)},${(H - P - (v / max) * (H - 2 * P)).toFixed(1)}`).join(' ')
  const secs = ((n - 1) * step).toFixed(1)
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl" role="img" aria-label="Measured versus suggested speed">
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="var(--border)" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="var(--border)" />
        <polyline points={pts(measured)} fill="none" stroke="var(--speed-measured)" strokeWidth="2.5" />
        <polyline points={pts(suggested)} fill="none" stroke="var(--speed-suggested)" strokeWidth="2.5" strokeDasharray="6 4" />
        <text x={P} y={H - 6} fontSize="10" fill="var(--muted-foreground)">0 s</text>
        <text x={W - P} y={H - 6} fontSize="10" textAnchor="end" fill="var(--muted-foreground)">{secs} s</text>
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: 'var(--speed-measured)' }} />Measured</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: 'var(--speed-suggested)' }} />Suggested</span>
        <span>relative speed</span>
      </figcaption>
    </figure>
  )
}
