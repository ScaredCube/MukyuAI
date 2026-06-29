'use client'

import { X, FileText } from 'lucide-react'
import type { Attachment } from '@/lib/types'
import { formatBytes } from '@/lib/file-utils'

interface AttachmentPreviewProps {
  attachments: Attachment[]
  onRemove: (id: string) => void
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="relative group border rounded-lg bg-muted/20 shrink-0"
        >
          {att.mimeType.startsWith('image/') ? (
            <div className="w-16 h-16 flex items-center justify-center overflow-hidden rounded-lg">
              <img
                src={att.previewData || `data:${att.mimeType};base64,${att.data}`}
                alt={att.name}
                className="max-w-full max-h-full object-cover rounded-lg"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5 h-10">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium truncate max-w-[120px]">{att.name}</div>
                <div className="text-[10px] text-muted-foreground">{formatBytes(att.size)}</div>
              </div>
            </div>
          )}
          <button
            onClick={() => onRemove(att.id)}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-background border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
            aria-label="删除附件"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
