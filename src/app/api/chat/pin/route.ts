import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { createMessage } from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { chapterId, query, answer } = body

  if (!chapterId || !query || !answer) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const userMsg = {
    id: uuidv4(),
    chapterId,
    role: 'user' as const,
    content: `[浮动查询] ${query}`,
  }
  const assistantMsg = {
    id: uuidv4(),
    chapterId,
    role: 'assistant' as const,
    content: answer,
  }

  await createMessage(userMsg)
  await createMessage(assistantMsg)

  return NextResponse.json({
    userMsg: { ...userMsg, timestamp: new Date().toISOString() },
    assistantMsg: { ...assistantMsg, timestamp: new Date().toISOString() },
  })
}
