import type { EmbeddingConfig, KnowledgeChunk } from './types'
import { getEmbedding } from './embedding'
import { listKnowledgeChunksWithDocName } from './db'

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function retrieveRelevantChunks(
  query: string,
  sessionId: string,
  embeddingConfig: EmbeddingConfig,
  options?: { topK?: number; minScore?: number }
): Promise<{ chunk: KnowledgeChunk; score: number; docName: string }[]> {
  const topK = options?.topK ?? 5
  const minScore = options?.minScore ?? 0.3

  // Get the query embedding
  const queryEmbedding = await getEmbedding(embeddingConfig, query)

  // Load all chunks for this session
  const chunks = await listKnowledgeChunksWithDocName(sessionId)

  const scored = chunks.map((chunk) => {
    const score = cosineSimilarity(queryEmbedding, chunk.embedding)
    return {
      chunk: {
        id: chunk.id,
        docId: chunk.docId,
        sessionId: chunk.sessionId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding,
      },
      score,
      docName: chunk.docName,
    }
  })

  return scored
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
