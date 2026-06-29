import { NextRequest, NextResponse } from 'next/server'
import { listMessages, updateChapter } from '@/lib/db'
import { chat } from '@/lib/llm'
import { assembleSummaryContext } from '@/lib/context'
import type { Provider } from '@/lib/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { chapterId, provider, model } = body as { chapterId: string; provider: Provider; model: string }

  if (!chapterId || !provider?.apiKey) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const messages = await listMessages(chapterId)
  if (messages.length === 0) {
    return NextResponse.json({ error: 'No messages in chapter' }, { status: 400 })
  }

  const ctx = assembleSummaryContext(messages)
  const allMessages = [...ctx.systemMessages, ...ctx.historyMessages]

  try {
    const summary = await chat(provider, model, allMessages)
    await updateChapter(chapterId, { chapterSummary: summary, status: 'completed' })
    return NextResponse.json({ summary })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to summarize: ' + (e instanceof Error ? e.message : '') }, { status: 500 })
  }
}
