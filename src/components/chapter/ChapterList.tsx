'use client'

import { Check, Circle, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Chapter } from '@/lib/types'
import { motion } from 'motion/react'

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
        <motion.div
          layout
          className="p-2 space-y-1"
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: {
                staggerChildren: 0.05
              }
            }
          }}
        >
          {chapters.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              还没有章节
            </p>
          )}
          {chapters.map((ch) => (
            <motion.button
              key={ch.id}
              onClick={() => onSelect(ch)}
              variants={{
                hidden: { opacity: 0, x: -8 },
                show: { opacity: 1, x: 0 }
              }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 group relative overflow-hidden',
                activeChapterId === ch.id
                  ? 'text-primary font-medium'
                  : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              )}
            >
              {activeChapterId === ch.id && (
                <motion.div
                  layoutId="active-chapter-pill"
                  className="absolute inset-0 bg-primary/10"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              {ch.status === 'completed' ? (
                <Check className="h-4 w-4 text-green-500 shrink-0 relative z-10" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0 relative z-10" />
              )}
              <span className="truncate flex-1 relative z-10">{ch.title}</span>
            </motion.button>
          ))}
        </motion.div>
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
