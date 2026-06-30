import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'
import type { Attachment, KnowledgeDoc, KnowledgeChunk } from './types'

const DATA_DIR = process.env.MUKYU_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'mukyu-ai.db')

let db: DatabaseSync | null = null

async function getDb(): Promise<DatabaseSync> {
  if (db) return db

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA foreign_keys=ON')

  initSchema(db)
  return db
}

function initSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      planning_history_summary TEXT DEFAULT NULL,
      last_planning_token_count INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      "order" INTEGER NOT NULL DEFAULT 0,
      previous_summary TEXT,
      chapter_summary TEXT,
      history_summary TEXT DEFAULT NULL,
      last_token_count INTEGER DEFAULT NULL,
      outline TEXT NOT NULL DEFAULT '',
      objectives TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      is_summarized INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    )
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS planning_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      is_summarized INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (doc_id) REFERENCES knowledge_docs(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  // migrations
  try { database.exec("ALTER TABLE chapters ADD COLUMN outline TEXT NOT NULL DEFAULT ''") } catch { /* already exists */ }
  try { database.exec("ALTER TABLE chapters ADD COLUMN objectives TEXT NOT NULL DEFAULT ''") } catch { /* already exists */ }
  try { database.exec('ALTER TABLE messages ADD COLUMN conversation_title TEXT') } catch { /* already exists */ }
  try { database.exec('ALTER TABLE messages ADD COLUMN attachments TEXT') } catch { /* already exists */ }
  try { database.exec('ALTER TABLE planning_messages ADD COLUMN attachments TEXT') } catch { /* already exists */ }
  try { database.exec('ALTER TABLE chapters ADD COLUMN history_summary TEXT DEFAULT NULL') } catch { /* already exists */ }
  try { database.exec('ALTER TABLE sessions ADD COLUMN planning_history_summary TEXT DEFAULT NULL') } catch { /* already exists */ }
  try { database.exec('ALTER TABLE messages ADD COLUMN is_summarized INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }
  try { database.exec('ALTER TABLE planning_messages ADD COLUMN is_summarized INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }
  try { database.exec('ALTER TABLE chapters ADD COLUMN last_token_count INTEGER DEFAULT NULL') } catch { /* already exists */ }
  try { database.exec('ALTER TABLE sessions ADD COLUMN last_planning_token_count INTEGER DEFAULT NULL') } catch { /* already exists */ }
}

function mapSession(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    title: row.title as string,
    goal: row.goal as string,
    summary: row.summary as string,
    planningHistorySummary: (row.planning_history_summary as string | null) ?? undefined,
    lastPlanningTokenCount: row.last_planning_token_count as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapChapter(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    title: row.title as string,
    order: row.order as number,
    previousSummary: row.previous_summary as string | null,
    chapterSummary: row.chapter_summary as string | null,
    historySummary: (row.history_summary as string | null) ?? undefined,
    lastTokenCount: row.last_token_count as number | null,
    outline: row.outline as string,
    objectives: row.objectives as string,
    status: row.status as 'active' | 'completed',
    createdAt: row.created_at as string,
  }
}

function mapMessage(row: Record<string, unknown>) {
  const attachmentsRaw = row.attachments as string | null
  return {
    id: row.id as string,
    chapterId: (row.chapter_id ?? row.session_id) as string,
    role: row.role as 'user' | 'assistant' | 'system',
    content: row.content as string,
    timestamp: row.timestamp as string,
    conversationTitle: (row.conversation_title as string | null) ?? undefined,
    attachments: attachmentsRaw ? parseAttachments(attachmentsRaw) : undefined,
    isSummarized: (row.is_summarized as number) === 1,
  }
}

function parseAttachments(raw: string): Attachment[] | undefined {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch { /* ignore */ }
  return undefined
}

function mapKnowledgeDoc(row: Record<string, unknown>): KnowledgeDoc {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    name: row.name as string,
    mimeType: row.mime_type as string,
    size: row.size as number,
    chunkCount: row.chunk_count as number,
    createdAt: row.created_at as string,
  }
}

// --- Session CRUD ---

export async function createSession(id: string): Promise<void> {
  const database = await getDb()
  database.prepare('INSERT INTO sessions (id) VALUES (?)').run(id)
}

export async function updateSession(id: string, data: { title?: string; goal?: string; summary?: string; planningHistorySummary?: string | null; lastPlanningTokenCount?: number | null }): Promise<void> {
  const database = await getDb()
  const sets: string[] = []
  const vals: any[] = []
  if (data.title !== undefined) { sets.push('title = ?'); vals.push(data.title) }
  if (data.goal !== undefined) { sets.push('goal = ?'); vals.push(data.goal) }
  if (data.summary !== undefined) { sets.push('summary = ?'); vals.push(data.summary) }
  if (data.planningHistorySummary !== undefined) { sets.push('planning_history_summary = ?'); vals.push(data.planningHistorySummary) }
  if (data.lastPlanningTokenCount !== undefined) { sets.push('last_planning_token_count = ?'); vals.push(data.lastPlanningTokenCount) }
  sets.push("updated_at = datetime('now')")
  vals.push(id)
  database.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export async function getSession(id: string) {
  const database = await getDb()
  const row = database.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapSession(row) : null
}

export async function listSessions() {
  const database = await getDb()
  const rows = database.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as Record<string, unknown>[]
  return rows.map(mapSession)
}

export async function deleteSession(id: string): Promise<void> {
  const database = await getDb()
  database.prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

// --- Chapter CRUD ---

export async function createChapter(chapter: {
  id: string
  sessionId: string
  title: string
  order: number
}): Promise<void> {
  const database = await getDb()
  database.prepare(
    'INSERT INTO chapters (id, session_id, title, "order") VALUES (?, ?, ?, ?)'
  ).run(chapter.id, chapter.sessionId, chapter.title, chapter.order)
}

export async function updateChapter(id: string, data: {
  title?: string
  previousSummary?: string | null
  chapterSummary?: string | null
  historySummary?: string | null
  lastTokenCount?: number | null
  outline?: string
  objectives?: string
  status?: 'active' | 'completed'
  order?: number
}): Promise<void> {
  const database = await getDb()
  const sets: string[] = []
  const vals: any[] = []
  if (data.title !== undefined) { sets.push('title = ?'); vals.push(data.title) }
  if (data.previousSummary !== undefined) { sets.push('previous_summary = ?'); vals.push(data.previousSummary) }
  if (data.chapterSummary !== undefined) { sets.push('chapter_summary = ?'); vals.push(data.chapterSummary) }
  if (data.historySummary !== undefined) { sets.push('history_summary = ?'); vals.push(data.historySummary) }
  if (data.lastTokenCount !== undefined) { sets.push('last_token_count = ?'); vals.push(data.lastTokenCount) }
  if (data.outline !== undefined) { sets.push('outline = ?'); vals.push(data.outline) }
  if (data.objectives !== undefined) { sets.push('objectives = ?'); vals.push(data.objectives) }
  if (data.status !== undefined) { sets.push('status = ?'); vals.push(data.status) }
  if (data.order !== undefined) { sets.push('"order" = ?'); vals.push(data.order) }
  vals.push(id)
  database.prepare(`UPDATE chapters SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export async function getChapter(id: string) {
  const database = await getDb()
  const row = database.prepare('SELECT * FROM chapters WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapChapter(row) : null
}

export async function listChapters(sessionId: string) {
  const database = await getDb()
  const rows = database.prepare('SELECT * FROM chapters WHERE session_id = ? ORDER BY "order"').all(sessionId) as Record<string, unknown>[]
  return rows.map(mapChapter)
}

export async function deleteChapter(id: string): Promise<void> {
  const database = await getDb()
  database.prepare('DELETE FROM chapters WHERE id = ?').run(id)
}

export async function getMaxChapterOrder(sessionId: string): Promise<number> {
  const database = await getDb()
  const result = database.prepare('SELECT MAX("order") as max_order FROM chapters WHERE session_id = ?').get(sessionId) as { max_order: number | null } | undefined
  return result?.max_order ?? 0
}

// --- Message CRUD ---

export async function createMessage(msg: {
  id: string
  chapterId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: Attachment[]
}): Promise<void> {
  const database = await getDb()
  const attachmentsJson = msg.attachments?.length ? JSON.stringify(msg.attachments) : null
  const cleanContent = msg.role === 'assistant' ? msg.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() : msg.content
  database.prepare(
    'INSERT INTO messages (id, chapter_id, role, content, attachments) VALUES (?, ?, ?, ?, ?)'
  ).run(msg.id, msg.chapterId, msg.role, cleanContent, attachmentsJson)
}

export async function listMessages(chapterId: string) {
  const database = await getDb()
  const rows = database.prepare('SELECT * FROM messages WHERE chapter_id = ? ORDER BY timestamp').all(chapterId) as Record<string, unknown>[]
  return rows.map(mapMessage)
}

export async function deleteMessages(chapterId: string): Promise<void> {
  const database = await getDb()
  database.prepare('DELETE FROM messages WHERE chapter_id = ?').run(chapterId)
}

export async function getMessage(id: string) {
  const database = await getDb()
  const row = database.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapMessage(row) : null
}

export async function updateMessage(id: string, content: string): Promise<void> {
  const database = await getDb()
  const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  database.prepare('UPDATE messages SET content = ? WHERE id = ?').run(cleanContent, id)
}

export async function deleteMessageById(id: string): Promise<void> {
  const database = await getDb()
  database.prepare('DELETE FROM messages WHERE id = ?').run(id)
}

export async function getMessagesAfter(chapterId: string, timestamp: string) {
  const database = await getDb()
  const rows = database.prepare('SELECT * FROM messages WHERE chapter_id = ? AND timestamp > ? ORDER BY timestamp LIMIT 1').all(chapterId, timestamp) as Record<string, unknown>[]
  return rows.map(mapMessage)
}

export async function updateConversationTitle(messageId: string, title: string): Promise<void> {
  const database = await getDb()
  database.prepare('UPDATE messages SET conversation_title = ? WHERE id = ?').run(title, messageId)
}

// --- Planning Message CRUD ---

export async function createPlanningMessage(msg: {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: Attachment[]
}): Promise<void> {
  const database = await getDb()
  const attachmentsJson = msg.attachments?.length ? JSON.stringify(msg.attachments) : null
  const cleanContent = msg.role === 'assistant' ? msg.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() : msg.content
  database.prepare(
    'INSERT INTO planning_messages (id, session_id, role, content, attachments) VALUES (?, ?, ?, ?, ?)'
  ).run(msg.id, msg.sessionId, msg.role, cleanContent, attachmentsJson)
}

export async function listPlanningMessages(sessionId: string) {
  const database = await getDb()
  const rows = database.prepare('SELECT * FROM planning_messages WHERE session_id = ? ORDER BY timestamp').all(sessionId) as Record<string, unknown>[]
  return rows.map(mapMessage)
}

export async function deletePlanningMessages(sessionId: string): Promise<void> {
  const database = await getDb()
  database.prepare('DELETE FROM planning_messages WHERE session_id = ?').run(sessionId)
}

// --- Knowledge Doc CRUD ---

export async function createKnowledgeDoc(doc: {
  id: string
  sessionId: string
  name: string
  mimeType: string
  size: number
  chunkCount: number
}): Promise<void> {
  const database = await getDb()
  database.prepare(
    'INSERT INTO knowledge_docs (id, session_id, name, mime_type, size, chunk_count) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(doc.id, doc.sessionId, doc.name, doc.mimeType, doc.size, doc.chunkCount)
}

export async function listKnowledgeDocs(sessionId: string): Promise<KnowledgeDoc[]> {
  const database = await getDb()
  const rows = database.prepare('SELECT * FROM knowledge_docs WHERE session_id = ? ORDER BY created_at DESC').all(sessionId) as Record<string, unknown>[]
  return rows.map(mapKnowledgeDoc)
}

export async function deleteKnowledgeDoc(id: string): Promise<void> {
  const database = await getDb()
  database.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(id)
}

export async function getKnowledgeDocCount(sessionId: string): Promise<number> {
  const database = await getDb()
  const result = database.prepare('SELECT COUNT(*) as count FROM knowledge_docs WHERE session_id = ?').get(sessionId) as { count: number } | undefined
  return result?.count ?? 0
}

// --- Knowledge Chunk CRUD ---

export async function createKnowledgeChunks(chunks: KnowledgeChunk[]): Promise<void> {
  const database = await getDb()
  database.exec('BEGIN TRANSACTION')
  try {
    const insert = database.prepare(
      'INSERT INTO knowledge_chunks (id, doc_id, session_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const chunk of chunks) {
      insert.run(
        chunk.id,
        chunk.docId,
        chunk.sessionId,
        chunk.chunkIndex,
        chunk.content,
        JSON.stringify(chunk.embedding)
      )
    }
    database.exec('COMMIT')
  } catch (e) {
    database.exec('ROLLBACK')
    throw e
  }
}

export async function listKnowledgeChunksWithDocName(sessionId: string): Promise<(KnowledgeChunk & { docName: string })[]> {
  const database = await getDb()
  const rows = database.prepare(`
    SELECT c.*, d.name as doc_name 
    FROM knowledge_chunks c
    JOIN knowledge_docs d ON c.doc_id = d.id
    WHERE c.session_id = ?
  `).all(sessionId) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: row.id as string,
    docId: row.doc_id as string,
    sessionId: row.session_id as string,
    chunkIndex: row.chunk_index as number,
    content: row.content as string,
    embedding: JSON.parse(row.embedding as string) as number[],
    docName: row.doc_name as string,
  }))
}

export async function markMessagesAsSummarized(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return
  const database = await getDb()
  const placeholders = messageIds.map(() => '?').join(',')
  database.prepare(`UPDATE messages SET is_summarized = 1 WHERE id IN (${placeholders})`).run(...messageIds)
}

export async function markPlanningMessagesAsSummarized(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return
  const database = await getDb()
  const placeholders = messageIds.map(() => '?').join(',')
  database.prepare(`UPDATE planning_messages SET is_summarized = 1 WHERE id IN (${placeholders})`).run(...messageIds)
}
