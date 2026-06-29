import { NextRequest, NextResponse } from 'next/server'
import { listSessions, createSession } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'

export async function GET() {
  const sessions = await listSessions()
  return NextResponse.json(sessions)
}

export async function POST(req: NextRequest) {
  const { id } = await req.json()
  const sessionId = id || uuidv4()
  await createSession(sessionId)
  return NextResponse.json({ id: sessionId })
}
