'use client'

import { useState, useEffect, useCallback, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Edit3, ChevronRight, ChevronDown, ChevronUp, Search, Pin, Target, List, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChatArea } from '@/components/chat/ChatArea'
import { ChapterList } from '@/components/chapter/ChapterList'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import { ConversationTimeline } from '@/components/chat/ConversationTimeline'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useSettings } from '@/lib/settings-context'
import { toast } from 'sonner'
import type { Session, Chapter, Message, Attachment } from '@/lib/types'
import { motion, AnimatePresence } from 'motion/react'

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

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const { settings, getCurrentProvider, getCurrentModel, updateSettings } = useSettings()
  const provider = getCurrentProvider()
  const model = getCurrentModel()

  const [session, setSession] = useState<Session | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [floatQuery, setFloatQuery] = useState('')
  const [floatAnswer, setFloatAnswer] = useState('')
  const [floatLoading, setFloatLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [floatAttachments, setFloatAttachments] = useState<Attachment[]>([])
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [selPopup, setSelPopup] = useState<{ text: string; x: number; y: number } | null>(null)
  const [editMsg, setEditMsg] = useState<{ id: string; content: string } | null>(null)
  const [editText, setEditText] = useState('')
  const [chapterHeaderCollapsed, setChapterHeaderCollapsed] = useState(true)
  const [kbDocCount, setKbDocCount] = useState(0)

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`)
      const data = await res.json()
      if (data.error) { router.push('/'); return }
      setSession(data)
      if (!data.summary) { router.replace(`/session/${sessionId}/plan`); return }
    } catch { router.push('/') }
  }, [sessionId, router])

  const fetchKbDocCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/knowledge?sessionId=${sessionId}`)
      const data = await res.json()
      if (data.docs) {
        setKbDocCount(data.docs.length)
      }
    } catch { /* ignore */ }
  }, [sessionId])

  const fetchChapters = useCallback(async () => {
    try {
      const res = await fetch(`/api/chapters?sessionId=${sessionId}`)
      const data = await res.json()
      setChapters(data)
      if (data.length > 0 && !activeChapter) {
        const ch = data[0] as Chapter
        setActiveChapter(ch)
      }
    } catch { /* ignore */ } finally { setPageLoading(false) }
  }, [sessionId, activeChapter])

  useEffect(() => { fetchSession() }, [fetchSession])
  useEffect(() => { fetchChapters() }, [fetchChapters])
  useEffect(() => { fetchKbDocCount() }, [fetchKbDocCount])

  useEffect(() => {
    if (activeChapter) loadChapterMessages(activeChapter.id)
  }, [activeChapter])

  const loadChapterMessages = async (chapterId: string) => {
    try {
      const res = await fetch(`/api/chat?chapterId=${chapterId}`)
      if (!res.ok) { setMessages([]); return }
      const data = await res.json()
      setMessages(data.messages || [])
    } catch { setMessages([]) }
  }

  const handleChapterSelect = (chapter: Chapter) => {
    setActiveChapter(chapter)
    setStreaming('')
  }

  const processAttachmentsForSend = async (attachments: Attachment[]): Promise<{ processedAttachments: Attachment[]; documentText: string; imageDescriptionText: string }> => {
    if (attachments.length === 0) return { processedAttachments: [], documentText: '', imageDescriptionText: '' }

    const docAttachments = attachments.filter((a) => !a.mimeType.startsWith('image/'))
    const imageAttachments = attachments.filter((a) => a.mimeType.startsWith('image/'))

    let documentText = ''
    let imageDescriptionText = ''

    // Document processing
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

    // External image understanding
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
          } catch { /* skip failed image understanding */ }
        }
        if (descriptions.length > 0) {
          imageDescriptionText = descriptions.join('\n')
        }
      }
    }

    return { processedAttachments: attachments, documentText, imageDescriptionText }
  }

  const handleSend = async (message: string, attachments: Attachment[]) => {
    if (!activeChapter || !provider?.apiKey) {
      toast.error(provider?.apiKey ? '请选择一个章节' : '请先在设置中配置API Key')
      return
    }
    setLoading(true)

    const tempId = Date.now().toString()
    const tempUserMsg: Message = {
      id: tempId,
      chapterId: activeChapter.id,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      attachments,
    }
    setMessages((prev) => [...prev, tempUserMsg])
    setStreaming('')

    const { processedAttachments, documentText, imageDescriptionText } = await processAttachmentsForSend(attachments)

    setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, attachments: processedAttachments } : m))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: activeChapter.id,
          message,
          provider, model,
          attachments: processedAttachments,
          documentText,
          imageDescriptionText,
          imageParsingMethod: settings.imageParsingMethod,
          documentParsingMethod: settings.documentParsingMethod,
          embeddingConfig: settings.embeddingConfig,
          contextLength: settings.contextLength,
          compressionThreshold: settings.compressionThreshold,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        toast.error(err.error || `请求失败 (${res.status})`)
        setLoading(false); return
      }
      let fullContent = ''
      const reader = res.body?.getReader(); if (!reader) return
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        const text = decoder.decode(value)
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line)
            if (data.content) { fullContent += data.content; setStreaming(fullContent) }
            if (data.done) {
              const assistantMsg: Message = { id: data.messageId || (Date.now() + 1).toString(), chapterId: activeChapter.id, role: 'assistant', content: fullContent, timestamp: new Date().toISOString() }
              const serverUserMsgId = data.userMsgId || tempUserMsg.id
              setMessages((prev) => {
                const updated = prev.map((m) => m.id === tempUserMsg.id ? { ...m, id: serverUserMsgId } : m)
                return [...updated, assistantMsg]
              })
              setStreaming('')
              generateConversationTitle(serverUserMsgId, message, fullContent)
              if (data.lastTokenCount !== undefined && activeChapter) {
                setActiveChapter(prev => prev ? { ...prev, lastTokenCount: data.lastTokenCount } : null)
                setChapters(prev => prev.map(c => c.id === activeChapter.id ? { ...c, lastTokenCount: data.lastTokenCount } : c))
              }
            }
            if (data.error) toast.error(data.error)
          } catch { /* ignore */ }
        }
      }
    } catch (e) { toast.error('请求失败: ' + (e instanceof Error ? e.message : '')) }
    finally { setLoading(false) }
  }

  const handleCompleteChapter = async (chapter: Chapter) => {
    if (!provider?.apiKey) { toast.error('请先配置API Key'); return }
    try {
      const res = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapterId: chapter.id, provider, model }) })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      toast.success('章节总结已生成')
      fetchChapters()
      const currentIdx = chapters.findIndex((c) => c.id === chapter.id)
      if (currentIdx < chapters.length - 1) {
        const nextChapter = chapters[currentIdx + 1]
        await fetch(`/api/chapters/${nextChapter.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ previousSummary: data.summary }),
        })
      }
    } catch { toast.error('生成总结失败') }
  }

  const handleFloatQuery = async () => {
    if (!floatQuery.trim() || floatLoading || !provider?.apiKey) {
      if (!provider?.apiKey) toast.error('请先配置API Key')
      return
    }
    setFloatLoading(true); setFloatAnswer('')

    try {
      let processedFloatAttachments = floatAttachments
      let floatDocText = ''
      let floatImageDesc = ''
      if (floatAttachments.length > 0) {
        const { processedAttachments, documentText, imageDescriptionText } = await processAttachmentsForSend(floatAttachments)
        processedFloatAttachments = processedAttachments
        floatDocText = documentText
        floatImageDesc = imageDescriptionText
      }

      const res = await fetch('/api/float-query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: floatQuery.trim(),
          sessionSummary: session?.summary || '',
          provider, model,
          attachments: processedFloatAttachments,
          documentText: floatDocText,
          imageDescriptionText: floatImageDesc,
          imageParsingMethod: settings.imageParsingMethod,
          documentParsingMethod: settings.documentParsingMethod,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setFloatAnswer(err.error || `请求失败 (${res.status})`); setFloatLoading(false); return
      }
      let fullContent = ''
      const reader = res.body?.getReader(); if (!reader) return
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        const text = decoder.decode(value)
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line)
            if (data.content) { fullContent += data.content; setFloatAnswer(fullContent) }
            if (data.error) setFloatAnswer(data.error)
          } catch { /* ignore */ }
        }
      }
    } catch { setFloatAnswer('查询失败') }
    finally { setFloatLoading(false) }
  }

  const handlePinFloat = async () => {
    if (!activeChapter || !floatQuery || !floatAnswer) return
    try {
      const res = await fetch('/api/chat/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapterId: activeChapter.id, query: floatQuery, answer: floatAnswer }) })
      const data = await res.json()
      setMessages((prev) => [...prev, { ...data.userMsg, chapterId: activeChapter.id, timestamp: new Date().toISOString() }, { ...data.assistantMsg, chapterId: activeChapter.id, timestamp: new Date().toISOString() }])
      toast.success('已钉入当前章节')
    } catch { toast.error('钉入失败') }
  }

  const handleRetry = async (userMsgId: string) => {
    if (!provider?.apiKey) { toast.error('请先配置API Key'); return }
    setLoading(true); setStreaming('')
    const userIdx = messages.findIndex((m) => m.id === userMsgId)
    const aiIdsToRemove: string[] = []
    for (let i = userIdx + 1; i < messages.length; i++) {
      if (messages[i].role === 'assistant') { aiIdsToRemove.push(messages[i].id) }
    }
    setMessages((prev) => prev.filter((m) => !aiIdsToRemove.includes(m.id)))
    try {
      const res = await fetch('/api/messages', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: userMsgId,
          provider,
          model,
          contextLength: settings.contextLength,
          compressionThreshold: settings.compressionThreshold,
        }),
      })
      if (!res.ok) { toast.error('重试失败'); setLoading(false); return }
      let fullContent = ''
      const reader = res.body?.getReader(); if (!reader) return
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of decoder.decode(value).split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line)
            if (data.content) { fullContent += data.content; setStreaming(fullContent) }
            if (data.done) {
              setMessages((prev) => [...prev, { id: data.messageId, chapterId: activeChapter!.id, role: 'assistant', content: fullContent, timestamp: new Date().toISOString() }])
              setStreaming('')
              const userMsg = messages.find((m) => m.id === userMsgId)
              if (userMsg) generateConversationTitle(userMsgId, userMsg.content, fullContent)
              if (data.lastTokenCount !== undefined && activeChapter) {
                setActiveChapter(prev => prev ? { ...prev, lastTokenCount: data.lastTokenCount } : null)
                setChapters(prev => prev.map(c => c.id === activeChapter.id ? { ...c, lastTokenCount: data.lastTokenCount } : c))
              }
            }
            if (data.error) toast.error(data.error)
          } catch { /* ignore */ }
        }
      }
    } finally { setLoading(false) }
  }

  const handleEdit = (userMsgId: string, content: string) => {
    setEditMsg({ id: userMsgId, content })
    setEditText(content)
  }

  const handleEditSubmit = async () => {
    if (!editMsg || !provider?.apiKey) return
    const msgId = editMsg.id
    setEditMsg(null); setLoading(true); setStreaming('')
    const userIdx = messages.findIndex((m) => m.id === msgId)
    const aiIdsToRemove: string[] = []
    for (let i = userIdx + 1; i < messages.length; i++) {
      if (messages[i].role === 'assistant') { aiIdsToRemove.push(messages[i].id) }
    }
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: editText } : m).filter((m) => !aiIdsToRemove.includes(m.id)))
    try {
      const res = await fetch('/api/messages', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: msgId,
          content: editText,
          provider,
          model,
          contextLength: settings.contextLength,
          compressionThreshold: settings.compressionThreshold,
        }),
      })
      if (!res.ok) { toast.error('编辑失败'); setLoading(false); return }
      let fullContent = ''
      const reader = res.body?.getReader(); if (!reader) return
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of decoder.decode(value).split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line)
            if (data.content) { fullContent += data.content; setStreaming(fullContent) }
            if (data.done) {
              setMessages((prev) => [...prev, { id: data.messageId, chapterId: activeChapter!.id, role: 'assistant', content: fullContent, timestamp: new Date().toISOString() }])
              setStreaming('')
              generateConversationTitle(msgId, editText, fullContent)
              if (data.lastTokenCount !== undefined && activeChapter) {
                setActiveChapter(prev => prev ? { ...prev, lastTokenCount: data.lastTokenCount } : null)
                setChapters(prev => prev.map(c => c.id === activeChapter.id ? { ...c, lastTokenCount: data.lastTokenCount } : c))
              }
            }
            if (data.error) toast.error(data.error)
          } catch { /* ignore */ }
        }
      }
    } finally { setLoading(false) }
  }

  const handleDelete = async (userMsgId: string) => {
    if (!confirm('确定删除这条对话及AI回复？')) return
    try {
      const res = await fetch('/api/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: userMsgId }) })
      const targetMsg = messages.find((m) => m.id === userMsgId)
      if (!targetMsg) return
      const userIdx = messages.findIndex((m) => m.id === userMsgId)
      let aiMsgId: string | null = null
      for (let i = userIdx + 1; i < messages.length; i++) {
        if (messages[i].role === 'assistant') { aiMsgId = messages[i].id; break }
      }
      setMessages((prev) => prev.filter((m) => m.id !== userMsgId && m.id !== aiMsgId))

      if (res.ok) {
        const data = await res.json()
        if (data.lastTokenCount !== undefined && activeChapter) {
          setActiveChapter(prev => prev ? { ...prev, lastTokenCount: data.lastTokenCount } : null)
          setChapters(prev => prev.map(c => c.id === activeChapter.id ? { ...c, lastTokenCount: data.lastTokenCount } : c))
        }
      }
    } catch { toast.error('删除失败') }
  }

  const generateConversationTitle = async (userMsgId: string, userContent: string, assistantContent: string) => {
    try {
      const res = await fetch('/api/generate-conversation-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessageId: userMsgId, userContent, assistantContent, provider, model }),
      })
      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => prev.map((m) => m.id === userMsgId ? { ...m, conversationTitle: data.title } : m))
      }
    } catch {
      // 静默失败，不影响主流程
    }
  }

  const getConversationNodes = () => {
    const nodes: { id: string; title: string; userMessageId: string }[] = []
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (msg.role === 'user') {
        nodes.push({
          id: msg.id,
          title: msg.conversationTitle || msg.content.slice(0, 20) + (msg.content.length > 20 ? '...' : ''),
          userMessageId: msg.id,
        })
      }
    }
    return nodes
  }

  const handleTimelineNodeClick = (userMessageId: string) => {
    const msgElement = document.querySelector(`[data-message-id="${userMessageId}"]`)
    if (msgElement) {
      msgElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }


  // selection popup - listen on document, read ref inside handler
  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(() => {
        const container = chatContainerRef.current
        const sel = window.getSelection()
        const text = sel?.toString().trim()
        if (!text || text.length < 2) {
          setSelPopup(null)
          return
        }
        if (!container) return
        const inContainer = container.contains(sel?.anchorNode || null) || container.contains(sel?.focusNode || null)
        if (!inContainer) return

        const range = sel!.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) {
          setSelPopup(null)
          return
        }
        setSelPopup({
          text,
          x: rect.left + rect.width / 2,
          y: rect.bottom + 6,
        })
      }, 10)
    }

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-sel-popup]')) return
      setSelPopup(null)
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [])

  const handleSelQuery = () => {
    if (!selPopup) return
    setFloatQuery(`解释一下"${selPopup.text.slice(0, 150)}${selPopup.text.length > 150 ? '...' : ''}"`)
    setSelPopup(null)
    setSidebarOpen(true)
  }

  const ChapterHeader = activeChapter && (activeChapter.outline || activeChapter.objectives) ? (
    <div className="px-4 border-b bg-muted/30">
      <div className="max-w-3xl mx-auto py-2">
        <button
          onClick={() => setChapterHeaderCollapsed(!chapterHeaderCollapsed)}
          className="w-full flex items-center justify-between py-1 text-left hover:opacity-80 transition-opacity"
        >
          <Target className="h-4 w-4 text-primary shrink-0 mr-2" />
          <span className="font-semibold text-sm truncate flex-1">{activeChapter.title}</span>
          <motion.div
            animate={{ rotate: chapterHeaderCollapsed ? 0 : 180 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 ml-2"
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </motion.div>
        </button>
        <AnimatePresence initial={false}>
          {!chapterHeaderCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden space-y-2 pb-3 mt-1"
            >
              {activeChapter.objectives && (
                <div className="flex items-start gap-2 text-sm mt-1">
                  <span className="font-medium text-muted-foreground shrink-0">目标：</span>
                  <span>{activeChapter.objectives}</span>
                </div>
              )}
              {activeChapter.outline && (
                <div className="flex items-start gap-2 text-sm">
                  <List className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-muted-foreground">
                    <MarkdownRenderer content={activeChapter.outline} />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  ) : null

  if (pageLoading) {
    return <div className="h-screen flex items-center justify-center bg-background"><div className="text-muted-foreground">加载中...</div></div>
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b px-4 py-3 flex items-center gap-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push('/')}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="font-semibold flex-1 truncate flex items-center gap-2">
          <span>{session?.title || '学习'}</span>
          {kbDocCount > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-normal shrink-0">
              知识库 ({kbDocCount})
            </span>
          )}
        </h1>
        <ModelSelector settings={settings} onSelect={(pId, mId) => updateSettings({ ...settings, currentProviderId: pId, selectedModelId: mId })} />
        <Button variant="outline" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className={sidebarOpen ? 'bg-muted' : ''}>
          <Search className="h-4 w-4 mr-1" />
          查询
        </Button>
        <Button variant="outline" size="sm" onClick={() => router.push(`/session/${sessionId}/plan`)}>
          <Edit3 className="h-4 w-4 mr-1" />规划
        </Button>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="w-56 border-r shrink-0">
          <ChapterList chapters={chapters} activeChapterId={activeChapter?.id ?? null} onSelect={handleChapterSelect} onComplete={handleCompleteChapter} />
        </div>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative" ref={chatContainerRef}>
          {ChapterHeader}
          <div className="flex-1 flex flex-col min-h-0 relative">
            <ChatArea
              messages={messages}
              streaming={streaming}
              onSend={handleSend}
              loading={loading}
              onRetry={handleRetry}
              onEdit={handleEdit}
              onDelete={handleDelete}
              contextLength={settings.contextLength}
              lastTokenCount={activeChapter?.lastTokenCount}
            />
            <ConversationTimeline nodes={getConversationNodes()} onNodeClick={handleTimelineNodeClick} />
          </div>
        </div>

        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              className="border-l shrink-0 flex flex-col overflow-hidden bg-background h-full"
            >
              <div className="p-3 border-b flex items-center justify-between shrink-0">
                <h3 className="text-sm font-semibold flex items-center gap-1 select-none">
                  <Search className="h-4 w-4" />浮动查询
                </h3>
                <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 flex flex-col p-3 gap-3 overflow-y-auto min-h-0">
                <div className="text-xs text-muted-foreground">
                  临时提问，带学习主题上下文。可选中文后自动带入。
                </div>
                <Textarea
                  value={floatQuery}
                  onChange={(e) => setFloatQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFloatQuery() } }}
                  placeholder="输入要查询的概念..."
                  className="min-h-[60px] max-h-[120px] resize-none text-sm"
                  rows={3}
                  disabled={floatLoading}
                />
                <Button onClick={handleFloatQuery} disabled={floatLoading || !floatQuery.trim()} size="sm">
                  {floatLoading ? '查询中...' : '查询'}
                </Button>
                {floatAnswer && (
                  <div className="flex-1 overflow-auto min-h-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">回答</span>
                      <Button variant="ghost" size="sm" onClick={handlePinFloat} className="h-6 text-xs">
                        <Pin className="h-3 w-3 mr-1" />钉入本章
                      </Button>
                    </div>
                    <div className="bg-muted/50 rounded-md p-3 text-sm">
                      <MarkdownRenderer content={floatAnswer} />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selPopup && (
          <motion.div
            data-sel-popup
            initial={{ opacity: 0, scale: 0.9, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 5 }}
            transition={{ type: 'spring', stiffness: 450, damping: 25 }}
            className="fixed z-50 -translate-x-1/2 shadow-lg border rounded-lg bg-popover px-3 py-2"
            style={{ left: selPopup.x, top: selPopup.y }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground max-w-48 truncate select-none">
                &ldquo;{selPopup.text.slice(0, 40)}{selPopup.text.length > 40 ? '...' : ''}&rdquo;
              </span>
              <Button size="sm" onClick={handleSelQuery} className="h-7 text-xs gap-1">
                <MessageSquare className="h-3 w-3" />
                询问
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={!!editMsg} onOpenChange={() => setEditMsg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑消息</DialogTitle></DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[100px]"
            placeholder="编辑你的问题..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMsg(null)}>取消</Button>
            <Button onClick={handleEditSubmit} disabled={!editText.trim()}>保存并重新生成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
