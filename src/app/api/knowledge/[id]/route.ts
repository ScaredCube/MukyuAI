import { NextRequest, NextResponse } from 'next/server'
import { deleteKnowledgeDoc } from '@/lib/db'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }
    await deleteKnowledgeDoc(id)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '删除失败' }, { status: 500 })
  }
}
