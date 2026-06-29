import { NextRequest, NextResponse } from 'next/server'
import { listChapters, createChapter, getMaxChapterOrder } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  const chapters = await listChapters(sessionId)
  return NextResponse.json(chapters)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { sessionId, title } = body
  if (!sessionId || !title) return NextResponse.json({ error: 'sessionId and title required' }, { status: 400 })

  const maxOrder = await getMaxChapterOrder(sessionId)
  const chapter = {
    id: uuidv4(),
    sessionId,
    title,
    order: maxOrder + 1,
  }
  await createChapter(chapter)
  return NextResponse.json(chapter)
}
