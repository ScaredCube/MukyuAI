import { NextRequest } from 'next/server'
import { streamChat, ChatMessage, buildMultimodalContent } from '@/lib/llm'
import { assembleFloatContext } from '@/lib/context'
import type { Provider, Attachment, DocumentParsingMethod, ImageParsingMethod } from '@/lib/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { query, sessionSummary, provider, model, attachments, documentText, imageDescriptionText, imageParsingMethod, documentParsingMethod } = body as {
    query: string; sessionSummary: string; provider: Provider; model: string
    attachments?: Attachment[]; documentText?: string; imageDescriptionText?: string
    imageParsingMethod?: ImageParsingMethod; documentParsingMethod?: DocumentParsingMethod
  }

  if (!query || !provider?.apiKey) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const ctx = assembleFloatContext(sessionSummary)

  const hasAttachments = attachments && attachments.length > 0
  let userContent: string | import('@/lib/llm').ContentPart[]
  if (hasAttachments) {
    const isExternalImage = imageParsingMethod === 'external'
    const llmAttachments = isExternalImage
      ? attachments.filter((a) => !a.mimeType.startsWith('image/'))
      : attachments
    const docTexts = llmAttachments
      .filter((a) => !a.mimeType.startsWith('image/'))
      .map((a) => a.processedText || '')
      .filter(Boolean)
      .join('\n\n')
    const fullDocText = [documentText, imageDescriptionText, docTexts].filter(Boolean).join('\n\n')
    userContent = buildMultimodalContent(query, llmAttachments, fullDocText || undefined, documentParsingMethod || 'text')
  } else {
    userContent = query
  }

  const allMessages: ChatMessage[] = [...ctx.systemMessages, { role: 'user', content: userContent }]

  const encoder = new TextEncoder()
  let fullResponse = ''

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(provider, model, allMessages)) {
          if (chunk.type === 'content' && chunk.content) {
            fullResponse += chunk.content
            controller.enqueue(encoder.encode(JSON.stringify({ content: chunk.content }) + '\n'))
          }
        }
        controller.enqueue(encoder.encode(JSON.stringify({ done: true }) + '\n'))
        controller.close()
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error'
        controller.enqueue(encoder.encode(JSON.stringify({ error: errMsg }) + '\n'))
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
