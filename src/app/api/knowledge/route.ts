import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { createKnowledgeDoc, createKnowledgeChunks } from '@/lib/db'
import { parseDocumentToText } from '@/lib/document-parser'
import { chunkText } from '@/lib/chunker'
import { getEmbeddings } from '@/lib/embedding'
import type { EmbeddingConfig, KnowledgeChunk } from '@/lib/types'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }
  const { listKnowledgeDocs } = await import('@/lib/db')
  const docs = await listKnowledgeDocs(sessionId)
  return NextResponse.json({ docs })
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const sessionId = formData.get('sessionId') as string | null
    const configStr = formData.get('embeddingConfig') as string | null

    if (!file || !sessionId || !configStr) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const embeddingConfig = JSON.parse(configStr) as EmbeddingConfig
    if (!embeddingConfig.apiKey) {
      return NextResponse.json({ error: '请先在设置中配置 Embedding API Key' }, { status: 400 })
    }

    // 1. Parse document to text
    const text = await parseDocumentToText(file)
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: '文档内容为空或无法提取文本' }, { status: 400 })
    }

    // 2. Chunk text
    const chunks = chunkText(text)
    if (chunks.length === 0) {
      return NextResponse.json({ error: '文档内容太少，未达到分块阈值' }, { status: 400 })
    }

    // 3. Vectorize chunks
    const textsToEmbed = chunks.map(c => c.content)
    const embeddings = await getEmbeddings(embeddingConfig, textsToEmbed)

    if (embeddings.length !== chunks.length) {
      return NextResponse.json({ error: '部分分块向量化失败，请重试' }, { status: 500 })
    }

    // 4. Save to database
    const docId = uuidv4()
    await createKnowledgeDoc({
      id: docId,
      sessionId,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      chunkCount: chunks.length
    })

    const knowledgeChunks: KnowledgeChunk[] = chunks.map((chunk) => ({
      id: uuidv4(),
      docId,
      sessionId,
      chunkIndex: chunk.index,
      content: chunk.content,
      embedding: embeddings[chunk.index]
    }))

    await createKnowledgeChunks(knowledgeChunks)

    return NextResponse.json({
      doc: {
        id: docId,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        chunkCount: chunks.length,
        createdAt: new Date().toISOString()
      }
    })

  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '上传并向量化失败' }, { status: 500 })
  }
}
