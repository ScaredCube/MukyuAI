import { NextRequest, NextResponse } from 'next/server'
import { chat, ChatMessage, ContentPart } from '@/lib/llm'
import type { Provider } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { imageBase64, mimeType, provider, model, prompt } = body as {
      imageBase64: string
      mimeType: string
      provider: Provider
      model: string
      prompt?: string
    }

    if (!imageBase64 || !provider?.apiKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const imagePrompt = prompt || '请详细描述这张图片的内容。如果是文档截图，请尽可能准确转录文字内容。如果是图表，请描述数据趋势和关键数值。用中文回复。'

    const content: ContentPart[] = [
      { type: 'text', text: imagePrompt },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
    ]

    const messages: ChatMessage[] = [
      { role: 'user', content },
    ]

    const result = await chat(provider, model, messages)
    return NextResponse.json({ description: result })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '图片理解失败' },
      { status: 500 }
    )
  }
}
