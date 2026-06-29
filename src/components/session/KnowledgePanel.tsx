'use client'

import { useState, useEffect, useRef, DragEvent } from 'react'
import { Upload, FileText, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/lib/settings-context'
import { toast } from 'sonner'
import type { KnowledgeDoc } from '@/lib/types'

interface KnowledgePanelProps {
  sessionId: string
}

export function KnowledgePanel({ sessionId }: KnowledgePanelProps) {
  const { settings } = useSettings()
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadingFile, setUploadingFile] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)

  const isConfigured = !!(settings.embeddingConfig && settings.embeddingConfig.apiKey)

  const fetchDocs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/knowledge?sessionId=${sessionId}`)
      const data = await res.json()
      if (data.docs) {
        setDocs(data.docs)
      }
    } catch {
      toast.error('获取知识库文档失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocs()
  }, [sessionId])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleUpload = async (file: File) => {
    if (!isConfigured) {
      toast.error('请先在设置中配置 Embedding API Key')
      return
    }

    setUploadingFile(file.name)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('sessionId', sessionId)
    formData.append('embeddingConfig', JSON.stringify(settings.embeddingConfig))

    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (res.ok && data.doc) {
        toast.success(`文档 "${file.name}" 上传并向量化成功`)
        setDocs((prev) => [data.doc, ...prev])
      } else {
        toast.error(data.error || '文件处理失败')
      }
    } catch (e) {
      toast.error(`文件 "${file.name}" 上传失败`)
    } finally {
      setUploadingFile(null)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files[0])
      e.target.value = ''
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要从知识库中删除 "${name}" 吗？`)) return
    try {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success(`"${name}" 已删除`)
        setDocs((prev) => prev.filter((d) => d.id !== id))
      } else {
        const data = await res.json()
        toast.error(data.error || '删除失败')
      }
    } catch {
      toast.error('删除失败')
    }
  }

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    setIsDragOver(true)
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files[0])
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
          <FileText className="h-4 w-4 text-primary" />
          知识库 (参考文档)
        </h3>
        <p className="text-xs text-muted-foreground">
          上传的参考文档将自动切片和向量化，在提问时作为背景资料引用。
        </p>
      </div>

      {!isConfigured ? (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <div>
              <span className="font-semibold text-foreground">未配置 Embedding 接口</span>
              <p className="mt-1">
                在使用知识库前，请先前往 <a href="/settings" className="underline font-medium hover:text-foreground text-foreground/80">设置页面</a> 配置您的向量模型 (Embedding API)。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1.5 ${
            isDragOver ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.txt,.csv,.md"
            onChange={handleFileChange}
            disabled={!!uploadingFile}
          />
          {uploadingFile ? (
            <>
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <div className="text-xs font-medium text-foreground">正在处理文档...</div>
              <div className="text-[10px] text-muted-foreground max-w-64 truncate">
                {uploadingFile} (文本解析与向量化中)
              </div>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-xs font-medium text-foreground">
                点击或拖拽参考文档到这里
              </div>
              <div className="text-[10px] text-muted-foreground">
                支持 PDF, Word, Excel, Markdown, TXT
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length > 0 ? (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between border rounded-md p-2.5 bg-card text-xs hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1 mr-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate" title={doc.name}>
                    {doc.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex gap-2">
                    <span>{formatBytes(doc.size)}</span>
                    <span>•</span>
                    <span>{doc.chunkCount} 分块</span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(doc.id, doc.name)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        !loading && (
          <div className="text-center py-6 text-[11px] text-muted-foreground border rounded-md border-dashed">
            知识库为空
          </div>
        )
      )}
    </div>
  )
}
