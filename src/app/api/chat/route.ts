import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { createMessage, listMessages, getChapter } from '@/lib/db'
import { streamChat, ChatMessage, buildMultimodalContent } from '@/lib/llm'
import { assembleChapterContext } from '@/lib/context'
import type { Provider, Attachment, DocumentParsingMethod, ImageParsingMethod, EmbeddingConfig } from '@/lib/types'

export async function GET(req: NextRequest) {
  const chapterId = req.nextUrl.searchParams.get('chapterId')
  if (!chapterId) return NextResponse.json({ error: 'chapterId required' }, { status: 400 })
  const messages = await listMessages(chapterId)
  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest) {
  try {
  const body = await req.json()
  const { chapterId, message, provider, model, attachments, documentText, imageDescriptionText, imageParsingMethod, documentParsingMethod, embeddingConfig, contextLength, compressionThreshold } = body as {
    chapterId: string; message: string; provider: Provider; model: string
    attachments?: Attachment[]; documentText?: string; imageDescriptionText?: string
    imageParsingMethod?: ImageParsingMethod; documentParsingMethod?: DocumentParsingMethod
    embeddingConfig?: EmbeddingConfig
    contextLength?: number
    compressionThreshold?: number
  }

  if (!chapterId || !message || !provider?.apiKey) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const chapter = await getChapter(chapterId)
  if (!chapter) {
    return new Response(JSON.stringify({ error: '章节不存在，请重新选择' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }

  const hasAttachments = attachments && attachments.length > 0

  // Save original message + ALL attachments to DB
  const userMsgId = uuidv4()
  await createMessage({
    id: userMsgId, chapterId, role: 'user', content: message,
    attachments: hasAttachments ? attachments : undefined,
  })

  let retrievedChunks: { content: string; docName: string; score: number }[] = []
  if (embeddingConfig && embeddingConfig.apiKey) {
    try {
      const { retrieveRelevantChunks } = await import('@/lib/retriever')
      const results = await retrieveRelevantChunks(message, chapter.sessionId, embeddingConfig)
      retrievedChunks = results.map(r => ({
        content: r.chunk.content,
        docName: r.docName,
        score: r.score
      }))
    } catch (e) {
      console.error('Failed to retrieve knowledge chunks:', e)
    }
  }

  const ctx = await assembleChapterContext(chapterId, retrievedChunks, provider, model, contextLength, compressionThreshold)

  // Build LLM content: filter attachments for external image mode, combine extra text
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
    userContent = buildMultimodalContent(message, llmAttachments, fullDocText || undefined, documentParsingMethod || 'text')
  } else {
    userContent = message
  }

  const allMessages: ChatMessage[] = [
    ...ctx.systemMessages,
    ...ctx.historyMessages,
    { role: 'user', content: userContent },
  ]

  const encoder = new TextEncoder()
  let fullResponse = ''
  const assistantMsgId = uuidv4()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        let promptTokens = 0
        let completionTokens = 0
        for await (const chunk of streamChat(provider, model, allMessages)) {
          if (chunk.type === 'content' && chunk.content) {
            fullResponse += chunk.content
            controller.enqueue(encoder.encode(JSON.stringify({ content: chunk.content }) + '\n'))
          } else if (chunk.type === 'usage' && chunk.usage) {
            if (chunk.usage.promptTokens > 0) {
              promptTokens = chunk.usage.promptTokens
            }
            if (chunk.usage.completionTokens > 0) {
              completionTokens = chunk.usage.completionTokens
            }
          }
        }
        await createMessage({ id: assistantMsgId, chapterId, role: 'assistant', content: fullResponse })
        const totalTokens = promptTokens + completionTokens
        if (totalTokens > 0) {
          const { updateChapter } = await import('@/lib/db')
          await updateChapter(chapterId, { lastTokenCount: totalTokens })
        }
        controller.enqueue(encoder.encode(JSON.stringify({ done: true, messageId: assistantMsgId, userMsgId, lastTokenCount: totalTokens }) + '\n'))
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
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
