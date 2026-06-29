export interface Session {
  id: string
  title: string
  goal: string
  summary: string
  planningHistorySummary?: string
  lastPlanningTokenCount?: number | null
  createdAt: string
  updatedAt: string
}

export interface Chapter {
  id: string
  sessionId: string
  title: string
  order: number
  previousSummary: string | null
  chapterSummary: string | null
  historySummary?: string
  lastTokenCount?: number | null
  outline: string
  objectives: string
  status: 'active' | 'completed'
  createdAt: string
}

export type FileCategory = 'image' | 'document'

export interface Attachment {
  id: string
  name: string
  mimeType: string
  size: number
  data: string
  previewData?: string
  processedText?: string
}

export interface Message {
  id: string
  chapterId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  conversationTitle?: string
  attachments?: Attachment[]
  isSummarized?: boolean
}

export interface PlanningMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  attachments?: Attachment[]
  isSummarized?: boolean
}

export type ProviderType = 'openai' | 'anthropic' | 'google'

export interface ModelInfo {
  id: string
  displayName: string
}

export interface Provider {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  apiKey: string
  models: ModelInfo[]
}

export type ImageParsingMethod = 'direct' | 'external'
export type DocumentParsingMethod = 'direct' | 'text'

export interface ExternalImageModel {
  providerId: string
  modelId: string
}

export interface EmbeddingConfig {
  providerType: 'openai' | 'google'
  baseUrl: string
  apiKey: string
  model: string
  dimensions?: number
}

export interface KnowledgeDoc {
  id: string
  sessionId: string
  name: string
  mimeType: string
  size: number
  chunkCount: number
  createdAt: string
}

export interface KnowledgeChunk {
  id: string
  docId: string
  sessionId: string
  chunkIndex: number
  content: string
  embedding: number[]
}

export interface AppSettings {
  currentProviderId: string | null
  selectedModelId: string | null
  providers: Provider[]
  imageParsingMethod: ImageParsingMethod
  documentParsingMethod: DocumentParsingMethod
  externalImageModel?: ExternalImageModel
  embeddingConfig?: EmbeddingConfig
  contextLength?: number          // max context size (in tokens)
  compressionThreshold?: number   // compression threshold percentage (e.g. 70)
}

export interface ChapterSuggestion {
  title: string
  description: string
}
