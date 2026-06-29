'use client'

import { Check, Circle, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Chapter } from '@/lib/types'

interface ChapterListProps {
  chapters: Chapter[]
  activeChapterId: string | null
  onSelect: (chapter: Chapter) => void
  onComplete: (chapter: Chapter) => void
}

export function ChapterList({ chapters, activeChapterId, onSelect, onComplete }: ChapterListProps) {
  const activeChapter = chapters.find((c) => c.id === activeChapterId)

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold">章节列表</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {chapters.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              还没有章节
            </p>
          )}
          {chapters.map((ch) => (
            <button
              key={ch.id}
              onClick={() => onSelect(ch)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 group',
                activeChapterId === ch.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted'
              )}
            >
              {ch.status === 'completed' ? (
                <Check className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="truncate flex-1">{ch.title}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
      {activeChapter && activeChapter.status === 'active' && (
        <div className="p-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onComplete(activeChapter)}
          >
            <Wand2 className="h-3 w-3 mr-1" />
            完成本章
          </Button>
        </div>
      )}
    </div>
  )
}
