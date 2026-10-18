import { useEffect, useState } from 'react'
import { getArchiveInfo } from '@/api/client'

// Archive mode only: says up front that this is a read-only snapshot with no backend behind it.
// The counts come from the archive manifest (api/archive.json); the defaults match the archive built from the 17 Oct snapshot.
export default function ArchiveBanner() {
  const [n, setN] = useState({
    events: 20, video: 20, when: '17 Oct, 14:16 BST',
    note: 'Cyclists and duplicate clips were removed, as in the final live version.',
  })
  useEffect(() => {
    getArchiveInfo()
      .then((m) => setN({ events: m.events, video: m.events_with_video, when: m.captured_label, note: m.note ?? '' }))
      .catch(() => {})
  }, [])
  return (
    <div role="note" aria-label="Archived demo" className="border-b border-demo/40 bg-demo/15">
      <div className="mx-auto max-w-[1600px] px-4 py-2 md:px-8">
        <p className="text-sm font-semibold text-demo">Archived demo · VAST Builders Challenge, London, 17 Oct 2026</p>
        <p className="mt-0.5 text-xs text-foreground/80">
          Read-only snapshot of data that was already processed during the event: the VAST Data VSS pipeline (video segments and
          YOLO11 boxes) and our own steps on the lab GPUs (NVIDIA Cosmos3-Reason, Nemotron VL position judge, optical-flow speed).
          There is no backend here: labels are not saved and new detectors cannot run. Snapshot from {n.when}: {n.events} events,
          {n.video === n.events ? ' all with video' : ` video for ${n.video} of them`}.{n.note && ` ${n.note}`} Footage: the public{' '}
          <a href="https://data.nvision2.eecs.yorku.ca/PIE_dataset" target="_blank" rel="noopener" className="underline">PIE dataset</a>{' '}
          (York University, MIT License), with faces and number plates blurred.
        </p>
      </div>
    </div>
  )
}
