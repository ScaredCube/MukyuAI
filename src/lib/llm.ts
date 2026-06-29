import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Provider, ProviderType, Attachment, DocumentParsingMethod } from './types'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { mimeType: string; data: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface StreamChunk {
  type: 'content' | 'usage'
  content?: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

function sanitizeForJSON(s: string): string {
  return s
    // strip BOM
    .replace(/^\uFEFF/, '')
    // strip all control chars (0x00-0x1F, 0x7F) except \n (0x0A) — replace with space
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, ' ')
    // normalize CRLF → LF, then CR → LF
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // strip lone surrogates (U+D800-U+DFFF) — invalid in JSON / UTF-8
    .replace(/[\uD800-\uDFFF]/g, '')
    // strip non-characters (U+FFFE, U+FFFF, U+FDD0-U+FDEF, etc.)
    .replace(/[\uFFFE\uFFFF]/g, '')
    .replace(/[\uFDD0-\uFDEF]/g, '')
    // collapse excessive whitespace-only lines
    .replace(/\n[ \t]+\n/g, '\n\n')
    // collapse 3+ consecutive newlines
    .replace(/\n{4,}/g, '\n\n\n')
    // strip <think>...</think> block including its content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim()
}

function sanitizeContentPart(part: ContentPart): ContentPart {
  if (part.type === 'text') {
    return { type: 'text', text: sanitizeForJSON(part.text) }
  }
  return part
}

function sanitizeMessage(m: ChatMessage): ChatMessage {
  if (typeof m.content === 'string') {
    return { role: m.role, content: sanitizeForJSON(m.content) }
  }
  return { role: m.role, content: m.content.map(sanitizeContentPart) }
}

export function buildMultimodalContent(
  text: string,
  attachments: Attachment[] | undefined,
  documentText: string | undefined,
  documentParsingMethod: DocumentParsingMethod = 'text'
): ContentPart[] {
  const parts: ContentPart[] = []

  const docText = documentText || ''
  if (docText) {
    parts.push({ type: 'text', text: text + '\n\n--- 附加内容 ---\n' + docText })
  } else {
    parts.push({ type: 'text', text })
  }

  if (attachments) {
    for (const att of attachments) {
      if (att.mimeType.startsWith('image/')) {
        const dataUrl = `data:${att.mimeType};base64,${att.data}`
        parts.push({ type: 'image_url', image_url: { url: dataUrl } })
      } else if (documentParsingMethod === 'direct') {
        parts.push({ type: 'file', file: { mimeType: att.mimeType, data: att.data } })
      }
    }
  }

  return parts
}

function toContentString(content: string | ContentPart[]): string {
  if (typeof content === 'string') return sanitizeForJSON(content)
  return sanitizeForJSON(
    content
      .filter((p) => p.type === 'text')
      .map((p) => ('text' in p ? p.text : ''))
      .join('\n')
  )
}

async function* streamOpenAI(provider: Provider, model: string, messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl || undefined })
  const mapped = messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content }
    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []
    for (const p of m.content) {
      if (p.type === 'text') {
        parts.push({ type: 'text', text: p.text })
      } else if (p.type === 'image_url') {
        parts.push({ type: 'image_url', image_url: { url: p.image_url.url } })
      }
      // OpenAI chat completions API does not support document/file uploads → skip 'file' parts
    }
    return { role: m.role, content: parts }
  })
  const stream = await client.chat.completions.create(
    {
      model,
      messages: mapped as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      stream: true,
      stream_options: { include_usage: true }
    },
    { signal }
  )
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) yield { type: 'content', content }
    if (chunk.usage) {
      yield {
        type: 'usage',
        usage: {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens
        }
      }
    }
  }
}

async function* streamAnthropic(provider: Provider, model: string, messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => toContentString(m.content)).filter(Boolean).join('\n')
  const chatMsgs = messages.filter((m) => m.role !== 'system').map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role as 'user' | 'assistant', content: m.content }
    }
    const blocks: Anthropic.ContentBlockParam[] = []
    for (const part of m.content) {
      if (part.type === 'text') {
        blocks.push({ type: 'text', text: part.text })
      } else if (part.type === 'image_url') {
        const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: match[2] },
          })
        }
      } else if (part.type === 'file') {
        if (part.file.mimeType === 'application/pdf') {
          blocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: part.file.data },
          })
        }
      }
    }
    return { role: m.role as 'user' | 'assistant', content: blocks }
  })

  const client = new Anthropic({ apiKey: provider.apiKey, baseURL: provider.baseUrl || undefined })
  const stream = await client.messages.create(
    {
      model,
      max_tokens: 8192,
      system: systemMsgs || undefined,
      messages: chatMsgs as Anthropic.MessageParam[],
      stream: true,
    },
    { signal }
  )
  for await (const chunk of stream) {
    if (chunk.type === 'message_start' && chunk.message.usage) {
      yield {
        type: 'usage',
        usage: {
          promptTokens: chunk.message.usage.input_tokens || 0,
          completionTokens: chunk.message.usage.output_tokens || 0
        }
      }
    }
    if (chunk.type === 'content_block_delta' && 'text' in chunk.delta) {
      yield { type: 'content', content: chunk.delta.text }
    }
    if (chunk.type === 'message_delta' && chunk.usage) {
      yield {
        type: 'usage',
        usage: {
          promptTokens: 0,
          completionTokens: chunk.usage.output_tokens || 0
        }
      }
    }
  }
}

function messageToGoogleParts(content: string | ContentPart[]): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  if (typeof content === 'string') {
    return [{ text: content }]
  }
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []
  for (const part of content) {
    if (part.type === 'text') {
      parts.push({ text: part.text })
    } else if (part.type === 'image_url') {
      const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
      }
    } else if (part.type === 'file') {
      parts.push({ inlineData: { mimeType: part.file.mimeType, data: part.file.data } })
    }
  }
  return parts
}

async function* streamGoogle(provider: Provider, model: string, messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const genAI = new GoogleGenerativeAI(provider.apiKey)
  const geminiModel = genAI.getGenerativeModel({
    model,
    baseUrl: provider.baseUrl || undefined,
  } as Parameters<typeof genAI.getGenerativeModel>[0])

  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => toContentString(m.content)).filter(Boolean).join('\n')
  const history = messages
    .filter((m) => m.role !== 'system')
    .slice(0, -1)
    .map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'model' | 'user',
      parts: messageToGoogleParts(m.content),
    }))
  const lastMsg = messages.filter((m) => m.role !== 'system').pop()

  const chat = geminiModel.startChat({
    history,
    systemInstruction: systemMsgs || undefined,
  })

  if (!lastMsg) return
  const result = await chat.sendMessageStream(messageToGoogleParts(lastMsg.content))
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield { type: 'content', content: text }
  }

  try {
    const response = await result.response
    if (response.usageMetadata) {
      yield {
        type: 'usage',
        usage: {
          promptTokens: response.usageMetadata.promptTokenCount || 0,
          completionTokens: response.usageMetadata.candidatesTokenCount || 0
        }
      }
    }
  } catch (e) {
    console.error('Failed to get Google metadata usage:', e)
  }
}

export async function* streamChat(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const sanitized = messages.map(sanitizeMessage)
  let baseGenerator: AsyncGenerator<StreamChunk>
  switch (provider.type) {
    case 'openai':
      baseGenerator = streamOpenAI(provider, model, sanitized, signal)
      break
    case 'anthropic':
      baseGenerator = streamAnthropic(provider, model, sanitized, signal)
      break
    case 'google':
      baseGenerator = streamGoogle(provider, model, sanitized, signal)
      break
    default:
      return
  }

  let inThinkingBlock = false
  let buffer = ''
  const startTag = '<think>'
  const endTag = '</think>'

  for await (const chunk of baseGenerator) {
    if (chunk.type === 'usage') {
      yield chunk
      continue
    }

    if (chunk.type === 'content' && chunk.content) {
      let yieldedText = ''
      for (let i = 0; i < chunk.content.length; i++) {
        const char = chunk.content[i]
        buffer += char

        if (!inThinkingBlock) {
          const lowerBuffer = buffer.toLowerCase()
          if (startTag.startsWith(lowerBuffer)) {
            if (lowerBuffer === startTag) {
              inThinkingBlock = true
              buffer = ''
            }
          } else {
            let matchLen = 0
            for (let len = buffer.length; len > 0; len--) {
              const suffix = buffer.slice(-len).toLowerCase()
              if (startTag.startsWith(suffix)) {
                matchLen = len
                break
              }
            }
            if (matchLen === 0) {
              yieldedText += buffer
              buffer = ''
            } else if (matchLen < buffer.length) {
              yieldedText += buffer.slice(0, -matchLen)
              buffer = buffer.slice(-matchLen)
            }
          }
        } else {
          const lowerBuffer = buffer.toLowerCase()
          if (endTag.startsWith(lowerBuffer)) {
            if (lowerBuffer === endTag) {
              inThinkingBlock = false
              buffer = ''
            }
          } else {
            let matchLen = 0
            for (let len = buffer.length; len > 0; len--) {
              const suffix = buffer.slice(-len).toLowerCase()
              if (endTag.startsWith(suffix)) {
                matchLen = len
                break
              }
            }
            if (matchLen === 0) {
              buffer = ''
            } else {
              buffer = buffer.slice(-matchLen)
            }
          }
        }
      }

      if (yieldedText) {
        yield { type: 'content', content: yieldedText }
      }
    }
  }

  if (!inThinkingBlock && buffer.length > 0) {
    yield { type: 'content', content: buffer }
  }
}

async function chatOpenAI(provider: Provider, model: string, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl || undefined })
  const mapped = messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content }
    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []
    for (const p of m.content) {
      if (p.type === 'text') {
        parts.push({ type: 'text', text: p.text })
      } else if (p.type === 'image_url') {
        parts.push({ type: 'image_url', image_url: { url: p.image_url.url } })
      }
    }
    return { role: m.role, content: parts }
  })
  const response = await client.chat.completions.create(
    { model, messages: mapped as OpenAI.Chat.Completions.ChatCompletionMessageParam[] },
    { signal }
  )
  return response.choices[0]?.message?.content ?? ''
}

async function chatAnthropic(provider: Provider, model: string, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => toContentString(m.content)).filter(Boolean).join('\n')
  const chatMsgs = messages.filter((m) => m.role !== 'system').map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role as 'user' | 'assistant', content: m.content }
    }
    const blocks: Anthropic.ContentBlockParam[] = []
    for (const part of m.content) {
      if (part.type === 'text') {
        blocks.push({ type: 'text', text: part.text })
      } else if (part.type === 'image_url') {
        const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: match[2] },
          })
        }
      } else if (part.type === 'file') {
        if (part.file.mimeType === 'application/pdf') {
          blocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: part.file.data },
          })
        }
      }
    }
    return { role: m.role as 'user' | 'assistant', content: blocks }
  })

  const client = new Anthropic({ apiKey: provider.apiKey, baseURL: provider.baseUrl || undefined })
  const response = await client.messages.create(
    {
      model,
      max_tokens: 8192,
      system: systemMsgs || undefined,
      messages: chatMsgs as Anthropic.MessageParam[],
    },
    { signal }
  )
  return 'content' in response ? response.content.map((c) => ('text' in c ? c.text : '')).join('') : ''
}

async function chatGoogle(provider: Provider, model: string, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const genAI = new GoogleGenerativeAI(provider.apiKey)
  const geminiModel = genAI.getGenerativeModel({
    model,
    baseUrl: provider.baseUrl || undefined,
  } as Parameters<typeof genAI.getGenerativeModel>[0])

  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => toContentString(m.content)).filter(Boolean).join('\n')
  const history = messages
    .filter((m) => m.role !== 'system')
    .slice(0, -1)
    .map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'model' | 'user',
      parts: messageToGoogleParts(m.content),
    }))
  const lastMsg = messages.filter((m) => m.role !== 'system').pop()

  const chat = geminiModel.startChat({
    history,
    systemInstruction: systemMsgs || undefined,
  })

  if (!lastMsg) return ''
  const result = await chat.sendMessage(messageToGoogleParts(lastMsg.content))
  return result.response.text()
}

export async function chat(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const sanitized = messages.map(sanitizeMessage)
  switch (provider.type) {
    case 'openai':
      return chatOpenAI(provider, model, sanitized, signal)
    case 'anthropic':
      return chatAnthropic(provider, model, sanitized, signal)
    case 'google':
      return chatGoogle(provider, model, sanitized, signal)
  }
}
