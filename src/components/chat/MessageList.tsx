'use client'

import { useEffect, useRef, useState } from 'react'
import { User, Bot, RotateCcw, Copy, Pencil, Trash2, Check, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarkdownRenderer } from './MarkdownRenderer'
import { formatBytes } from '@/lib/file-utils'
import type { Attachment } from '@/lib/types'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
  attachments?: Attachment[]
}

interface MessageListProps {
  messages: Message[]
  streaming?: string
  className?: string
  onRetry?: (userMsgId: string) => void
  onEdit?: (userMsgId: string, content: string) => void
  onDelete?: (userMsgId: string) => void
  loading?: boolean
}

export function MessageList({ messages, streaming, className, onRetry, onEdit, onDelete, loading }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const visibleMessages = messages.filter((m) => m.role !== 'system')
  const lastPairIdx = (() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].role === 'user') return i
    }
    return -1
  })()

  const handleCopy = async (content: string, msgId: string) => {
    await navigator.clipboard.writeText(content)
    setCopiedId(msgId)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className={cn('flex-1 overflow-y-auto px-4', className)}>
      <div className="max-w-3xl mx-auto py-4 space-y-6">
        {visibleMessages.map((msg, idx) => {
          const isLastUser = msg.role === 'user' && idx === lastPairIdx
          const isUser = msg.role === 'user'

          return (
            <div key={msg.id} className="flex gap-3 group" data-message-id={msg.id}>
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}>
                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">
                    {msg.role === 'user' ? '你' : 'AI'}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isUser && onRetry && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          for (let j = idx - 1; j >= 0; j--) {
                            if (visibleMessages[j].role === 'user') {
                              onRetry(visibleMessages[j].id)
                              break
                            }
                          }
                        }}
                        title="重新生成"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    {!isUser && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopy(msg.content, msg.id)}
                        title="复制"
                      >
                        {copiedId === msg.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    )}
                    {isUser && onEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn('h-6 w-6', !isLastUser && 'opacity-30 cursor-not-allowed')}
                        onClick={() => isLastUser && onEdit(msg.id, msg.content)}
                        title={isLastUser ? '编辑' : '只能编辑最后一对对话'}
                        disabled={!isLastUser}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {isUser && onDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => onDelete(msg.id)}
                        title="删除本条及回复"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {msg.attachments.map((att) => (
                      att.mimeType.startsWith('image/') ? (
                        <div key={att.id} className="relative">
                          <img
                            src={att.previewData || `data:${att.mimeType};base64,${att.data}`}
                            alt={att.name}
                            className="max-w-60 max-h-40 rounded-lg border cursor-pointer object-cover hover:opacity-90 transition-opacity"
                            onClick={() => setImagePreview(`data:${att.mimeType};base64,${att.data}`)}
                          />
                        </div>
                      ) : (
                        <div key={att.id} className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/30 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate max-w-[180px]">{att.name}</div>
                            <div className="text-xs text-muted-foreground">{formatBytes(att.size)}</div>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}

                <MarkdownRenderer content={msg.content} />
              </div>
            </div>
          )
        })}

        {(loading || streaming) && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium mb-1">AI</div>
              {streaming ? (
                <>
                  <MarkdownRenderer content={streaming} />
                  <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                </>
              ) : (
                <div className="flex items-center gap-1 h-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {imagePreview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center cursor-pointer"
          onClick={() => setImagePreview(null)}
        >
          <img
            src={imagePreview}
            alt="预览"
            className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  )
}
