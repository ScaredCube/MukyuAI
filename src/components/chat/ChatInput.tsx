'use client'

import { useState, useRef, KeyboardEvent, DragEvent, ClipboardEvent } from 'react'
import { ArrowUp, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AttachmentPreview } from './AttachmentPreview'
import { validateFile, blobToBase64, createImagePreview, formatBytes } from '@/lib/file-utils'
import type { Attachment } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'

interface ChatInputProps {
  onSend: (message: string, attachments: Attachment[]) => void
  disabled?: boolean
  placeholder?: string
  contextLength?: number
  lastTokenCount?: number | null
  messages?: { role: 'user' | 'assistant' | 'system'; content: string; isSummarized?: boolean }[]
  streaming?: string
}

function estimateTokens(text: string): number {
  if (!text) return 0
  const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g
  const cjkCount = (text.match(cjkRegex) || []).length
  const cleanText = text.replace(cjkRegex, ' ')
  const words = cleanText.trim().split(/\s+/)
  const wordCount = words.length === 1 && words[0] === '' ? 0 : words.length
  const remainingChars = text.length - cjkCount - cleanText.replace(/\s+/g, '').length
  return Math.ceil(cjkCount * 1.5 + wordCount * 1.3 + Math.max(0, remainingChars) * 0.5)
}

export function ChatInput({ onSend, disabled, placeholder = '输入消息...', contextLength, lastTokenCount, messages, streaming }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)

  const handleSend = () => {
    const hasText = input.trim().length > 0
    const hasAttachments = attachments.length > 0
    if ((!hasText && !hasAttachments) || disabled) return
    onSend(input.trim(), attachments)
    setInput('')
    setAttachments([])
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const addAttachment = async (att: Attachment) => {
    setAttachments((prev) => [...prev, att])
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const processFile = async (file: File) => {
    const validation = validateFile(file)
    if (!validation.valid) {
      toast.error(validation.error!)
      return
    }

    try {
      const reader = new FileReader()
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = () => reject(new Error('读取失败'))
        reader.readAsDataURL(file)
      })

      const attachment: Attachment = {
        id: uuidv4(),
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        data: base64Data,
      }

      if (file.type.startsWith('image/')) {
        try {
          attachment.previewData = await createImagePreview(base64Data, file.type)
        } catch { /* ignore */ }
      }

      await addAttachment(attachment)
    } catch {
      toast.error(`文件 "${file.name}" 读取失败`)
    }
  }

  const processFiles = (fileList: FileList) => {
    for (let i = 0; i < fileList.length; i++) {
      processFile(fileList[i])
    }
  }

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageItems: DataTransferItem[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItems.push(items[i])
      }
    }

    if (imageItems.length === 0) return

    e.preventDefault()

    for (const item of imageItems) {
      const file = item.getAsFile()
      if (file) {
        await processFile(file)
      }
    }
  }

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer?.types?.includes('Files')) {
      dragCounterRef.current += 1
      setIsDragOver(true)
    }
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files)
    }
  }

  return (
    <div
      className={`relative px-4 pb-4 pt-2 ${isDragOver ? 'bg-primary/5' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="absolute inset-2 flex items-center justify-center z-10 rounded-2xl border-2 border-dashed border-primary bg-background/80 pointer-events-none">
          <div className="text-primary font-medium">释放以上传文件</div>
        </div>
      )}
      <div className="max-w-3xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.txt,.csv"
          multiple
          onChange={handleFileChange}
        />
        <div
          className={`flex flex-col rounded-2xl border bg-background shadow-sm transition-colors focus-within:border-primary/60 ${
            isDragOver ? 'border-primary' : 'border-input'
          }`}
        >
          <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-4 pt-3 pb-1 shadow-none focus-visible:ring-0 focus-visible:border-0"
            rows={1}
            disabled={disabled}
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleFileSelect}
                disabled={disabled}
                title="上传文件或图片 (支持粘贴/拖拽)"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-5 w-5" />
              </Button>
              {(() => {
                const limit = contextLength || 256000
                const unsummarized = (messages || []).filter(m => !m.isSummarized)
                const msgTokens = unsummarized.reduce((sum, m) => sum + estimateTokens(m.content) + 10, 0)
                const totalTokens = 1000 + msgTokens + estimateTokens(streaming || '')
                const pct = Math.min(100, Math.max(0, (totalTokens / limit) * 100))

                return (
                  <div 
                    className="relative flex items-center justify-center w-6 h-6 select-none"
                    title={`当前上下文用量比例: ${pct.toFixed(1)}%`}
                  >
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        className="stroke-muted-foreground/10"
                        strokeWidth="2"
                        fill="transparent"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        className={`transition-all duration-300 ${
                          pct >= 90
                            ? 'stroke-destructive'
                            : pct >= 70
                            ? 'stroke-amber-500'
                            : 'stroke-primary'
                        }`}
                        strokeWidth="2"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 9}
                        strokeDashoffset={2 * Math.PI * 9 * (1 - pct / 100)}
                      />
                    </svg>
                  </div>
                )
              })()}
            </div>
            <Button
              onClick={handleSend}
              disabled={disabled || (!input.trim() && attachments.length === 0)}
              size="icon"
              className="h-8 w-8 rounded-full"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
