'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Settings, BookOpen, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { Session, Chapter } from '@/lib/types'
import { motion, AnimatePresence } from 'motion/react'

export default function HomePage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [chapterCounts, setChapterCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      const data = await res.json()
      setSessions(data)

      const counts: Record<string, number> = {}
      for (const s of data) {
        const chRes = await fetch(`/api/chapters?sessionId=${s.id}`)
        const chData = await chRes.json()
        counts[s.id] = chData.length
      }
      setChapterCounts(counts)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const createSession = async () => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await res.json()
    router.push(`/session/${id}/plan`)
  }

  const deleteSession = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    fetchSessions()
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Mukyu AI</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/settings')}>
            <Settings className="h-4 w-4 mr-1" />
            设置
          </Button>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button onClick={createSession}>
              <Plus className="h-4 w-4 mr-1" />
              新建学习
            </Button>
          </motion.div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center text-muted-foreground py-12">加载中...</div>
        ) : sessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="text-center py-20"
          >
            <BookOpen className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold mb-2">还没有学习主题</h2>
            <p className="text-muted-foreground mb-6">创建你的第一个学习主题，通过AI对话来规划学习路径</p>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="inline-block">
              <Button size="lg" onClick={createSession}>
                <Plus className="h-5 w-5 mr-2" />
                开始学习
              </Button>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            layout
            className="space-y-3"
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.06
                }
              }
            }}
          >
            <AnimatePresence mode="popLayout">
              {sessions.map((session) => (
                <motion.div
                  key={session.id}
                  layout
                  variants={{
                    hidden: { opacity: 0, y: 12, scale: 0.98 },
                    show: { 
                      opacity: 1, 
                      y: 0, 
                      scale: 1,
                      transition: {
                        type: 'spring',
                        stiffness: 380,
                        damping: 26
                      }
                    },
                    exit: { 
                      opacity: 0, 
                      scale: 0.96, 
                      x: -15, 
                      transition: { duration: 0.2 } 
                    }
                  }}
                  whileHover={{ 
                    y: -2,
                    scale: 1.005,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.04), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
                    transition: { duration: 0.2, ease: 'easeOut' }
                  }}
                  whileTap={{ scale: 0.995 }}
                  className="border rounded-lg p-4 hover:border-primary/50 bg-card transition-colors cursor-pointer group"
                  onClick={() => {
                    if (chapterCounts[session.id] > 0) {
                      router.push(`/session/${session.id}`)
                    } else {
                      router.push(`/session/${session.id}/plan`)
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">
                        {session.title || '未命名学习主题'}
                      </h3>
                      {session.goal && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {session.goal}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {session.summary ? (
                          <Badge variant="secondary">已规划</Badge>
                        ) : (
                          <Badge variant="outline">待规划</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {chapterCounts[session.id] ?? 0} 个章节
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteSession(session.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </div>
  )
}
