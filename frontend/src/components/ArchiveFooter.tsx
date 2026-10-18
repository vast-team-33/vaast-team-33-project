import { CONTACT, LINKS, TEAM, type Member } from '@/credits'

const LINK = 'underline hover:text-foreground'

function Person({ m }: { m: Member }) {
  return m.linkedin ? <a href={m.linkedin} target="_blank" rel="noopener" className={LINK}>{m.name}</a> : <span>{m.name}</span>
}

// Archive mode only: who built it, who to contact, and where the project lives. Shown on every page.
export default function ArchiveFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-[1600px] space-y-1 px-4 py-4 text-xs text-muted-foreground md:px-8">
        <p>
          Built by team 33 at the{' '}
          <a href={LINKS.hackathon} target="_blank" rel="noopener" className={LINK}>Real-Time Video Agents Hack</a>{' '}
          (VAST Builders Challenge), London, 17 Oct 2026:{' '}
          {TEAM.map((m, i) => <span key={i}>{i > 0 && ', '}<Person m={m} /></span>)}.
        </p>
        <p>
          Contact: <Person m={CONTACT} /> ·{' '}
          <a href={LINKS.project} target="_blank" rel="noopener" className={LINK}>Project page on tokens&amp;</a> ·{' '}
          <a href={LINKS.video} target="_blank" rel="noopener" className={LINK}>Demo video</a> ·{' '}
          <a href={LINKS.repo} target="_blank" rel="noopener" className={LINK}>Source on GitHub</a>
        </p>
      </div>
    </footer>
  )
}
