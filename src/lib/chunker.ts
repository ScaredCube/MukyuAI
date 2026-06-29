export interface TextChunk {
  content: string
  index: number
}

export function chunkText(
  text: string,
  options?: {
    maxChunkSize?: number
    overlapSize?: number
  }
): TextChunk[] {
  const maxChunkSize = options?.maxChunkSize ?? 800
  const overlapSize = options?.overlapSize ?? 80

  const paragraphs = text.split(/\n\n+/)
  const segments: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChunkSize) {
      segments.push(paragraph)
      continue
    }

    const lines = paragraph.split(/\n/)
    for (const line of lines) {
      if (line.length <= maxChunkSize) {
        segments.push(line)
        continue
      }

      const sentences = line.split(/(?<=[。！？.!?])/)
      for (const sentence of sentences) {
        segments.push(sentence)
      }
    }
  }

  const chunks: TextChunk[] = []
  let current = ''

  for (const segment of segments) {
    if (current.length + segment.length > maxChunkSize && current.length > 0) {
      const trimmed = current.trim()
      if (trimmed.length >= 20) {
        chunks.push({ content: trimmed, index: chunks.length })
      }
      const overlap = current.slice(-overlapSize)
      current = overlap + segment
    } else {
      current += (current ? '\n\n' : '') + segment
    }
  }

  const trimmed = current.trim()
  if (trimmed.length >= 20) {
    chunks.push({ content: trimmed, index: chunks.length })
  }

  return chunks
}
