'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { X, Search, Pin, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'

interface FloatingQueryProps {
  isOpen: boolean
  onToggle: () => void
  onQuery: (query: string) => Promise<string>
  onPin: (query: string, answer: string) => void
}

export function FloatingQuery({ isOpen, onToggle, onQuery, onPin }: FloatingQueryProps) {
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleAsk = async () => {
    if (!query.trim() || loading) return
    setLoading(true)
    setAnswer('')
    try {
      const result = await onQuery(query.trim())
      setAnswer(result)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  const handlePin = () => {
    if (query && answer) {
      onPin(query, answer)
      setQuery('')
      setAnswer('')
    }
  }

  return (
    <div className="border-t">
      <button
        onClick={onToggle}
        className="w-full px-4 py-2 flex items-center gap-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>浮动查询 (临时提问，不干扰主线)</span>
        {isOpen ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronUp className="h-4 w-4 ml-auto" />}
      </button>

      {isOpen && (
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Textarea
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="快速提问一个概念..."
              className="min-h-[40px] max-h-[100px] resize-none text-sm"
              rows={1}
              disabled={loading}
            />
            <Button onClick={handleAsk} disabled={loading || !query.trim()} size="sm">
              {loading ? '...' : '查询'}
            </Button>
          </div>

          {answer && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">回答：</span>
                <Button variant="ghost" size="sm" onClick={handlePin} className="h-6 text-xs">
                  <Pin className="h-3 w-3 mr-1" />
                  钉到当前章节
                </Button>
              </div>
              <div className="bg-muted/50 rounded-md p-3 text-sm">
                <MarkdownRenderer content={answer} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
