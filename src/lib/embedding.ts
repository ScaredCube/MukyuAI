import type { EmbeddingConfig } from './types'

export async function getEmbedding(
  config: EmbeddingConfig,
  text: string
): Promise<number[]> {
  const [result] = await getEmbeddings(config, [text])
  return result
}

export async function getEmbeddings(
  config: EmbeddingConfig,
  texts: string[]
): Promise<number[][]> {
  const results: number[][] = []
  const batchSize = 100

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const embeddings =
      config.providerType === 'google'
        ? await fetchGoogleEmbeddings(config, batch)
        : await fetchOpenAIEmbeddings(config, batch)
    results.push(...embeddings)
  }

  return results
}

async function fetchOpenAIEmbeddings(
  config: EmbeddingConfig,
  texts: string[]
): Promise<number[][]> {
  const body: Record<string, unknown> = {
    model: config.model,
    input: texts,
  }
  if (config.dimensions) {
    body.dimensions = config.dimensions
  }

  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`OpenAI embedding request failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.data.map((item: { embedding: number[] }) => item.embedding)
}

async function fetchGoogleEmbeddings(
  config: EmbeddingConfig,
  texts: string[]
): Promise<number[][]> {
  const response = await fetch(
    `${config.baseUrl}/v1beta/models/${config.model}:batchEmbedContents?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: texts.map((t) => ({
          model: `models/${config.model}`,
          content: { parts: [{ text: t }] },
        })),
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`Google embedding request failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.embeddings.map((item: { values: number[] }) => item.values)
}
