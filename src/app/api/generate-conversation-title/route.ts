import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/llm'
import { updateConversationTitle } from '@/lib/db'
import type { Provider } from '@/lib/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { userMessageId, userContent, assistantContent, provider, model } = body as {
    userMessageId: string; userContent: string; assistantContent: string; provider: Provider; model: string
  }

  try {
    const prompt = `请为以下对话生成一个简短的标题（5-10个字），只输出标题，不要其他内容：

用户问：${userContent}

AI答：${assistantContent.slice(0, 200)}${assistantContent.length > 200 ? '...' : ''}`

    const title = await chat(provider, model, [{ role: 'user', content: prompt }])
    const cleanTitle = title.trim().replace(/^["']|["']$/g, '').slice(0, 50)
    await updateConversationTitle(userMessageId, cleanTitle)
    return NextResponse.json({ title: cleanTitle })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
