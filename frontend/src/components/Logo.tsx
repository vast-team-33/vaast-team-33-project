// Drive Loop mark: a road (dashed lane) that loops back on itself, with the car's sensor at the centre.
// Colours follow the theme tokens; public/favicon.svg is the same mark with fixed colours.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 5A11 11 0 1 1 6.47 10.5" fill="none" stroke="var(--primary)" strokeWidth={4.6} />
      <path d="M16 5A11 11 0 1 1 6.47 10.5" fill="none" stroke="var(--background)" strokeWidth={1} strokeDasharray="1.8 2.2" />
      <path d="M9.2 5.9 2.9 8.6 10.1 12.6Z" fill="var(--primary)" />
      <circle cx="16" cy="16" r="4.4" fill="var(--primary)" opacity={0.25} />
      <circle cx="16" cy="16" r="2.3" fill="var(--primary)" />
    </svg>
  )
}
