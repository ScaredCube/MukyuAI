import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getMessage, deleteMessageById, getMessagesAfter, createMessage, updateMessage } from '@/lib/db'
import { streamChat, ChatMessage, buildMultimodalContent } from '@/lib/llm'
import { assembleChapterContext } from '@/lib/context'
import type { Provider, Attachment } from '@/lib/types'

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const { messageId } = body as { messageId: string }

  try {
    const msg = await getMessage(messageId)
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

    await deleteMessageById(msg.id)

    const chapterId = msg.chapterId || ''
    const nextMsgs = await getMessagesAfter(chapterId, msg.timestamp)
    if (nextMsgs.length > 0) {
      await deleteMessageById(nextMsgs[0].id)
    }

    let newLastTokenCount = 0
    if (chapterId) {
      const { assembleChapterContext, estimateMessagesTokens } = await import('@/lib/context')
      const { updateChapter } = await import('@/lib/db')
      const ctx = await assembleChapterContext(chapterId)
      newLastTokenCount = estimateMessagesTokens(ctx.systemMessages) + estimateMessagesTokens(ctx.historyMessages)
      await updateChapter(chapterId, { lastTokenCount: newLastTokenCount })
    }

    return NextResponse.json({ success: true, lastTokenCount: newLastTokenCount })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { messageId, content, provider, model, attachments, documentText, contextLength, compressionThreshold } = body as {
    messageId: string; content?: string; provider: Provider; model: string
    attachments?: Attachment[]; documentText?: string
    contextLength?: number; compressionThreshold?: number
  }

  try {
    const msg = await getMessage(messageId)
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    if (msg.role !== 'user') return NextResponse.json({ error: 'Can only edit user messages' }, { status: 400 })

    const chapterId = msg.chapterId!

    const nextMsgs = await getMessagesAfter(chapterId, msg.timestamp)
    for (const nextMsg of nextMsgs) {
      if (nextMsg.role === 'assistant') {
        await deleteMessageById(nextMsg.id)
      }
    }

    if (content) {
      await updateMessage(msg.id, content)
    }

    const ctx = await assembleChapterContext(
      chapterId,
      undefined,
      provider,
      model,
      contextLength ?? 256000,
      compressionThreshold ?? 70
    )
    const allMessages: ChatMessage[] = [...ctx.systemMessages, ...ctx.historyMessages]

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
          controller.enqueue(encoder.encode(JSON.stringify({ done: true, messageId: assistantMsgId, lastTokenCount: totalTokens }) + '\n'))
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
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
