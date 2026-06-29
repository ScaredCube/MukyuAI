'use client'

import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import type { Attachment } from '@/lib/types'

interface ChatAreaProps {
  messages: { id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp?: string; attachments?: Attachment[]; isSummarized?: boolean }[]
  streaming: string
  onSend: (message: string, attachments: Attachment[]) => void
  loading: boolean
  title?: string
  placeholder?: string
  onRetry?: (userMsgId: string) => void
  onEdit?: (userMsgId: string, content: string) => void
  onDelete?: (userMsgId: string) => void
  contextLength?: number
  lastTokenCount?: number | null
}

export function ChatArea({ messages, streaming, onSend, loading, title, placeholder, onRetry, onEdit, onDelete, contextLength, lastTokenCount }: ChatAreaProps) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      {title && (
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold truncate">{title}</h2>
        </div>
      )}
      <MessageList
        messages={messages}
        streaming={streaming}
        onRetry={onRetry}
        onEdit={onEdit}
        onDelete={onDelete}
        loading={loading}
      />
      <ChatInput
        onSend={onSend}
        disabled={loading}
        placeholder={placeholder}
        contextLength={contextLength}
        lastTokenCount={lastTokenCount}
        messages={messages}
        streaming={streaming}
      />
    </div>
  )
}
