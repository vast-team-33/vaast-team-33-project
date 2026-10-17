import { useState } from 'react'
import { Button } from '@/components/ui/button'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export default function CopyBlock({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const onCopy = async () => {
    setState((await copyText(text)) ? 'ok' : 'fail')
    setTimeout(() => setState('idle'), 2000)
  }
  return (
    <div className="space-y-2">
      <pre className="whitespace-pre-wrap rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed">{text}</pre>
      <Button variant="outline" size="sm" onClick={onCopy}>
        {state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : 'Copy prompt'}
      </Button>
    </div>
  )
}
