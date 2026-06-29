import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession, updateSession, listPlanningMessages, createChapter, getMaxChapterOrder, updateChapter } from '@/lib/db'
import { chat } from '@/lib/llm'
import { assembleChapterPlanContext } from '@/lib/context'
import type { Provider } from '@/lib/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { sessionId, provider, model } = body as { sessionId: string; provider: Provider; model: string }

  if (!sessionId || !provider?.apiKey) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const session = await getSession(sessionId)
  const rawPlanningMessages = await listPlanningMessages(sessionId)
  const planningMessages = rawPlanningMessages.filter(m => !m.isSummarized)
  if (planningMessages.length === 0 && !session?.planningHistorySummary) {
    return NextResponse.json({ error: 'No planning messages found' }, { status: 400 })
  }

  let retrievedChunks: { content: string; docName: string }[] = []
  try {
    const { listKnowledgeChunksWithDocName } = await import('@/lib/db')
    const chunks = await listKnowledgeChunksWithDocName(sessionId)
    retrievedChunks = chunks.slice(0, 30).map((c) => ({ content: c.content, docName: c.docName }))
  } catch (e) {
    console.error('Failed to load chunks for planning:', e)
  }

  const ctx = assembleChapterPlanContext(planningMessages, retrievedChunks, session?.planningHistorySummary)
  const allMessages = [...ctx.systemMessages, ...ctx.historyMessages]

  try {
    const response = await chat(provider, model, allMessages)
    const parsed = JSON.parse(response)

    const { title, goal, summary, chapters } = parsed as {
      title: string; goal: string; summary: string
      chapters: { title: string; description: string; objectives?: string; outline?: string }[]
    }

    await updateSession(sessionId, { title, goal, summary })

    const maxOrder = await getMaxChapterOrder(sessionId)
    const createdChapters = []
    for (let i = 0; i < chapters.length; i++) {
      const chId = uuidv4()
      await createChapter({ id: chId, sessionId, title: chapters[i].title, order: maxOrder + i + 1 })
      const outline = chapters[i].outline || ''
      const objectives = chapters[i].objectives || ''
      if (outline || objectives) {
        await updateChapter(chId, { outline, objectives })
      }
      createdChapters.push({ id: chId, title: chapters[i].title, description: chapters[i].description, objectives, outline, order: maxOrder + i + 1 })
    }

    return NextResponse.json({ title, goal, summary, chapters: createdChapters })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to generate plan: ' + (e instanceof Error ? e.message : '') }, { status: 500 })
  }
}
