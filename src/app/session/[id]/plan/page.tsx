'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Wand2, Trash2, Edit2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ChatArea } from '@/components/chat/ChatArea'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { KnowledgePanel } from '@/components/session/KnowledgePanel'
import { useSettings } from '@/lib/settings-context'
import { toast } from 'sonner'
import type { Attachment, Session, Chapter } from '@/lib/types'

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

interface PlanResult {
  title: string
  goal: string
  summary: string
  chapters: { id: string; title: string; description: string; objectives: string; outline: string; order: number }[]
}

export default function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const { settings, getCurrentProvider, getCurrentModel, updateSettings } = useSettings()
  const provider = getCurrentProvider()
  const model = getCurrentModel()
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string; attachments?: Attachment[]; isSummarized?: boolean }[]>([])
  const [streaming, setStreaming] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [planResult, setPlanResult] = useState<PlanResult | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [editingChapter, setEditingChapter] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ title: '', objectives: '', outline: '' })

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`)
      const data = await res.json()
      if (data.error) { router.push('/'); return }
      setSession(data)
    } catch { router.push('/') }
  }, [sessionId, router])

  const fetchChapters = useCallback(async () => {
    try {
      const res = await fetch(`/api/chapters?sessionId=${sessionId}`)
      const data = await res.json()
      setChapters(data)
    } catch { /* ignore */ }
  }, [sessionId])

  const fetchPlanningMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/planning?sessionId=${sessionId}`)
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages || [])
    } catch { /* ignore */ }
  }, [sessionId])

  useEffect(() => {
    fetchSession()
    fetchChapters()
    fetchPlanningMessages()
  }, [fetchSession, fetchChapters, fetchPlanningMessages])

  const processAttachmentsForPlanning = async (attachments: Attachment[]): Promise<{ processedAttachments: Attachment[]; documentText: string; imageDescriptionText: string }> => {
    if (attachments.length === 0) return { processedAttachments: [], documentText: '', imageDescriptionText: '' }

    const docAttachments = attachments.filter((a) => !a.mimeType.startsWith('image/'))
    const imageAttachments = attachments.filter((a) => a.mimeType.startsWith('image/'))

    let documentText = ''
    let imageDescriptionText = ''

    if (docAttachments.length > 0) {
      try {
        const formData = new FormData()
        for (const att of docAttachments) {
          const blob = new Blob([Uint8Array.from(atob(att.data), (c) => c.charCodeAt(0))], { type: att.mimeType })
          const file = new File([blob], att.name, { type: att.mimeType })
          formData.append('files', file)
        }
        formData.append('documentParsingMethod', settings.documentParsingMethod)
        formData.append('imageParsingMethod', settings.imageParsingMethod)

        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.error) {
          toast.error(data.error)
        } else {
          const processedDocs = (data.attachments as Attachment[]).filter((a) => !a.mimeType.startsWith('image/'))
          const docsMerged = docAttachments.map((orig) => {
            const processed = processedDocs.find((p) => p.name === orig.name)
            return processed ? { ...orig, processedText: processed.processedText } : orig
          })
          documentText = docsMerged.map((a) => a.processedText || '').filter(Boolean).join('\n\n')
        }
      } catch {
        toast.error('文件处理失败')
      }
    }

    if (imageAttachments.length > 0 && settings.imageParsingMethod === 'external' && settings.externalImageModel) {
      const extProvider = settings.providers.find((p) => p.id === settings.externalImageModel!.providerId)
      const extModel = settings.externalImageModel!.modelId
      if (extProvider?.apiKey && extModel) {
        const descriptions: string[] = []
        for (const img of imageAttachments) {
          try {
            const res = await fetch('/api/understand-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageBase64: img.data,
                mimeType: img.mimeType,
                provider: extProvider,
                model: extModel,
              }),
            })
            const data = await res.json()
            if (data.description) {
              const desc = `[图片描述: ${data.description}]`
              descriptions.push(desc)
              img.processedText = desc
            }
          } catch { /* skip */ }
        }
        if (descriptions.length > 0) {
          imageDescriptionText = descriptions.join('\n')
        }
      }
    }

    return { processedAttachments: attachments, documentText, imageDescriptionText }
  }


  const handleSend = async (message: string, attachments: Attachment[]) => {
    if (!provider?.apiKey) {
      toast.error('请先在设置中配置API Key')
      return
    }

    setLoading(true)

    const tempId = Date.now().toString()
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content: message, attachments }])
    setStreaming('')

    const { processedAttachments, documentText, imageDescriptionText } = await processAttachmentsForPlanning(attachments)

    setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, attachments: processedAttachments } : m))

    try {
      const res = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message, provider, model, attachments: processedAttachments, documentText, imageDescriptionText, imageParsingMethod: settings.imageParsingMethod, documentParsingMethod: settings.documentParsingMethod, embeddingConfig: settings.embeddingConfig, contextLength: settings.contextLength, compressionThreshold: settings.compressionThreshold }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        toast.error(err.error || `请求失败 (${res.status})`)
        setLoading(false)
        return
      }

      let fullContent = ''
      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.content) {
              fullContent += data.content
              setStreaming(fullContent)
            }
            if (data.done) {
              setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: fullContent }])
              setStreaming('')
              if (data.lastPlanningTokenCount !== undefined && session) {
                setSession(prev => prev ? { ...prev, lastPlanningTokenCount: data.lastPlanningTokenCount } : null)
              }
            }
            if (data.error) {
              toast.error(data.error)
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      toast.error('请求失败: ' + (e instanceof Error ? e.message : ''))
    } finally {
      setLoading(false)
    }
  }

  const handleGeneratePlan = async () => {
    if (!provider?.apiKey) {
      toast.error('请先在设置中配置API Key')
      return
    }

    setGenerating(true)
    try {
      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, provider, model }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      setPlanResult(data)
      fetchSession()
      fetchChapters()
      toast.success('学习计划已生成')
    } catch (e) {
      toast.error('生成计划失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleRegeneratePlan = async () => {
    if (!confirm('重新生成将清空现有章节和学习记录，确定继续？')) return
    if (!provider?.apiKey) {
      toast.error('请先在设置中配置API Key')
      return
    }

    setGenerating(true)
    try {
      for (const ch of chapters) {
        await fetch(`/api/chapters/${ch.id}`, { method: 'DELETE' })
      }
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '', goal: '', summary: '' }),
      })
      setChapters([])
      setPlanResult(null)
      fetchSession()
      toast.success('已清空，可以重新规划')
    } catch {
      toast.error('清空失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleDeleteChapter = async (chapterId: string) => {
    if (!confirm('确定删除此章节？')) return
    try {
      await fetch(`/api/chapters/${chapterId}`, { method: 'DELETE' })
      setChapters((prev) => prev.filter((c) => c.id !== chapterId))
      toast.success('章节已删除')
    } catch {
      toast.error('删除失败')
    }
  }

  const handleEditChapter = (chapter: Chapter) => {
    setEditingChapter(chapter.id)
    setEditForm({ title: chapter.title, objectives: chapter.objectives, outline: chapter.outline })
  }

  const handleSaveChapter = async (chapterId: string) => {
    try {
      await fetch(`/api/chapters/${chapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, ...editForm } : c)))
      setEditingChapter(null)
      toast.success('章节已更新')
    } catch {
      toast.error('更新失败')
    }
  }

  const handleStartLearning = () => {
    router.push(`/session/${sessionId}`)
  }

  const hasExistingPlan = session?.title && chapters.length > 0

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b px-4 py-3 flex items-center gap-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold">规划学习路径</h1>
        <div className="flex-1" />
        <ModelSelector settings={settings} onSelect={(pId, mId) => updateSettings({ ...settings, currentProviderId: pId, selectedModelId: mId })} />
        {hasExistingPlan && (
          <Button
            onClick={handleRegeneratePlan}
            disabled={generating}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            重新规划
          </Button>
        )}
        <Button
          onClick={handleGeneratePlan}
          disabled={loading || generating || messages.length < 2}
          variant="default"
        >
          <Wand2 className="h-4 w-4 mr-1" />
          {generating ? '生成中...' : hasExistingPlan ? '更新计划' : '生成学习计划'}
        </Button>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="w-80 border-r p-4 overflow-y-auto shrink-0 bg-muted/10">
          <KnowledgePanel sessionId={sessionId} />
        </div>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ChatArea
            messages={messages}
            streaming={streaming}
            onSend={handleSend}
            loading={loading}
            placeholder="描述你想学习的内容..."
            contextLength={settings.contextLength}
            lastTokenCount={session?.lastPlanningTokenCount}
          />
        </div>

        {(planResult || hasExistingPlan) && (
          <div className="w-96 border-l p-4 overflow-auto shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">学习计划</h2>
              {hasExistingPlan && (
                <Button onClick={handleStartLearning} size="sm">
                  开始学习
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {session && (
                <>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">标题</h3>
                    <p className="text-sm">{planResult?.title || session.title}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">目标</h3>
                    <p className="text-sm">{planResult?.goal || session.goal}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">摘要</h3>
                    <p className="text-sm text-muted-foreground">{planResult?.summary || session.summary}</p>
                  </div>
                </>
              )}

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">章节</h3>
                <div className="space-y-3">
                  {(planResult?.chapters || chapters).map((ch, i) => (
                    <div key={ch.id} className="border rounded-md p-3 text-sm">
                      {editingChapter === ch.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            placeholder="章节标题"
                            className="text-sm"
                          />
                          <Textarea
                            value={editForm.objectives}
                            onChange={(e) => setEditForm({ ...editForm, objectives: e.target.value })}
                            placeholder="学习目标"
                            className="text-sm min-h-[60px]"
                          />
                          <Textarea
                            value={editForm.outline}
                            onChange={(e) => setEditForm({ ...editForm, outline: e.target.value })}
                            placeholder="大纲（Markdown 列表）"
                            className="text-sm min-h-[80px]"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveChapter(ch.id)}>保存</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingChapter(null)}>取消</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium flex-1">{i + 1}. {ch.title}</span>
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => handleEditChapter(ch as Chapter)}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive"
                                onClick={() => handleDeleteChapter(ch.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {'description' in ch && ch.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{ch.description}</p>
                          )}
                          {ch.objectives && (
                            <p className="text-xs mt-1"><span className="font-medium">目标：</span>{ch.objectives}</p>
                          )}
                          {ch.outline && (
                            <div className="text-xs mt-1">
                              <span className="font-medium">大纲：</span>
                              <pre className="whitespace-pre-wrap font-sans text-muted-foreground mt-0.5">{ch.outline}</pre>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {planResult && !hasExistingPlan && (
                <Button onClick={handleStartLearning} className="w-full">
                  开始学习
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
