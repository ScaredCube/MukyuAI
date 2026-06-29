'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ConversationNode {
  id: string
  title: string
  userMessageId: string
}

interface ConversationTimelineProps {
  nodes: ConversationNode[]
  onNodeClick: (userMessageId: string) => void
}

export function ConversationTimeline({ nodes, onNodeClick }: ConversationTimelineProps) {
  const [hovered, setHovered] = useState<{ node: ConversationNode; idx: number; x: number; y: number } | null>(null)
  const [clickedId, setClickedId] = useState<string | null>(null)

  if (nodes.length === 0) return null

  const handleClick = (node: ConversationNode) => {
    setClickedId(node.id)
    onNodeClick(node.userMessageId)
    setTimeout(() => setClickedId(null), 600)
  }

  return (
    <>
      <div className="absolute right-6 top-4 bottom-4 z-30 pointer-events-none w-8">
        <div className="h-full overflow-y-auto no-scrollbar flex flex-col items-center justify-start py-2">
          <div className="relative flex flex-col items-center gap-3 py-1">
            {/* 垂直线 */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border/60 -translate-x-1/2" />

            {/* 节点 */}
            {nodes.map((node, idx) => (
              <button
                key={node.id}
                onClick={() => handleClick(node)}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setHovered({ node, idx, x: r.left, y: r.top + r.height / 2 })
                }}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  'relative z-10 w-3 h-3 rounded-full border-2 transition-colors pointer-events-auto',
                  clickedId === node.id
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/40 bg-background/90 hover:border-primary hover:bg-primary/40'
                )}
                style={{
                  // box-shadow ring — 不被 overflow 裁剪
                  boxShadow: clickedId === node.id
                    ? '0 0 0 4px rgba(99, 102, 241, 0.25)'
                    : undefined,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Fixed tooltip — 完全逃逸 overflow 裁剪 */}
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: hovered.x - 8,
            top: hovered.y,
            transform: 'translate(-100%, -50%)',
          }}
        >
          <div className="bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg border max-w-[220px] truncate">
            {hovered.node.title || `对话 ${hovered.idx + 1}`}
          </div>
        </div>
      )}
    </>
  )
}
