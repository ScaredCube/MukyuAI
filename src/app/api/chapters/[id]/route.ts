import { NextRequest, NextResponse } from 'next/server'
import { getChapter, updateChapter, deleteChapter } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const chapter = await getChapter(id)
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(chapter)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  await updateChapter(id, body)
  const chapter = await getChapter(id)
  return NextResponse.json(chapter)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteChapter(id)
  return NextResponse.json({ success: true })
}
