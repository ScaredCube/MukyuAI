'use client'

import { useState, useRef, useEffect } from 'react'
import { Settings, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Provider } from '@/lib/types'
import { useRouter } from 'next/navigation'

interface ModelSelectorProps {
  settings: { providers: Provider[]; currentProviderId: string | null; selectedModelId: string | null }
  onSelect: (providerId: string, modelId: string) => void
}

export function ModelSelector({ settings, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const currentProvider = settings.providers.find((p) => p.id === settings.currentProviderId)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!currentProvider) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 hover:bg-muted transition-colors max-w-[240px]"
      >
        <span className="font-medium truncate">
          {currentProvider.models.find((m) => m.id === settings.selectedModelId)?.displayName || settings.selectedModelId || '选择模型'}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-popover border rounded-md shadow-lg z-50 py-1 max-h-80 overflow-auto">
          <div className="px-2 py-1.5 text-xs text-muted-foreground border-b">
            {currentProvider.name} / {currentProvider.type}
          </div>
          {currentProvider.models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onSelect(currentProvider.id, m.id)
                setOpen(false)
              }}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors',
                m.id === settings.selectedModelId && 'bg-accent'
              )}
            >
              {m.displayName}
              {m.id !== m.displayName && <span className="text-muted-foreground ml-2">({m.id})</span>}
            </button>
          ))}
          <div className="border-t mt-1 pt-1">
            {settings.providers.map((p) => (
              p.id !== currentProvider.id && (
                <button
                  key={p.id}
                  onClick={() => {
                    const firstModel = p.models[0]
                    if (firstModel) onSelect(p.id, firstModel.id)
                    setOpen(false)
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center justify-between"
                >
                  <span>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground ml-1">({p.type})</span>
                  </span>
                  {p.models[0] && (
                    <span className="text-muted-foreground">{p.models[0].displayName}</span>
                  )}
                </button>
              )
            ))}
            <button
              onClick={() => { router.push('/settings'); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-1 text-muted-foreground"
            >
              <Settings className="h-3 w-3" />
              管理供应商...
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
