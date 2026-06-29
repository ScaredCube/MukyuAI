import type { Session, Chapter, Message, Provider } from './types'
import { getSession, listChapters, listMessages, getChapter } from './db'

export interface ContextAssembly {
  systemMessages: { role: 'system'; content: string }[]
  historyMessages: { role: 'user' | 'assistant'; content: string }[]
}

function cleanContent(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\t/g, ' ')
    .replace(/\r/g, '\n')
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g
  const cjkCount = (text.match(cjkRegex) || []).length
  const cleanText = text.replace(cjkRegex, ' ')
  const words = cleanText.trim().split(/\s+/)
  const wordCount = words.length === 1 && words[0] === '' ? 0 : words.length
  const remainingChars = text.length - cjkCount - cleanText.replace(/\s+/g, '').length
  return Math.ceil(cjkCount * 1.5 + wordCount * 1.3 + Math.max(0, remainingChars) * 0.5)
}

export function estimateMessagesTokens(messages: { role: string; content: string }[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 10, 0)
}

export async function assembleChapterContext(
  chapterId: string,
  retrievedChunks?: { content: string; docName: string; score: number }[],
  provider?: Provider,
  model?: string,
  contextLength = 256000,
  compressionThreshold = 70
): Promise<ContextAssembly> {
  const chapter = await getChapter(chapterId)
  if (!chapter) throw new Error('Chapter not found')

  const session = await getSession(chapter.sessionId)
  let systemMessages: { role: 'system'; content: string }[] = []

  if (session?.summary) {
    systemMessages.push({
      role: 'system',
      content: `你是一个学习辅导助手。用户正在学习以下内容：\n\n${session.summary}`,
    })
  }

  if (chapter.historySummary) {
    systemMessages.push({
      role: 'system',
      content: `以下是本章先前对话的摘要，作为学习进度的参考背景：\n${chapter.historySummary}`,
    })
  }

  if (retrievedChunks && retrievedChunks.length > 0) {
    const kbContent = `## 知识库参考资料（重要）
以下是用户上传的参考资料中与当前对话最相关的片段。在解答用户疑问或进行概念讲解时，请优先参考并以此内容为准。如果参考资料中没有相关内容，请据实告知用户。

${retrievedChunks.map(chunk => `### 来自《${chunk.docName}》 (相关度: ${chunk.score.toFixed(2)})
${chunk.content}`).join('\n\n')}`
    systemMessages.push({
      role: 'system',
      content: kbContent,
    })
  }

  if (chapter.outline || chapter.objectives) {
    let chapterGuide = '## 当前章节信息\n\n'
    if (chapter.objectives) chapterGuide += `**学习目标**：${chapter.objectives}\n\n`
    if (chapter.outline) chapterGuide += `**大纲**：\n${chapter.outline}\n\n`
    chapterGuide += `## 教学规则（重要）
- 每次只讲解大纲中的一个要点，不要把整章内容一次性讲完
- 讲解完一个要点后，停下来询问用户是否理解，或是否继续下一个要点
- 用对话式、引导式的方式教学，鼓励用户提问和思考
- 如果用户中途提问，先回答提问再回到大纲
- 公式请使用 $行内公式$ 或 $$公式块$$ 包裹。行内如 $x^2+y^2=1$，公式块需独占行：
$$
E=mc^2
$$`
    systemMessages.push({ role: 'system', content: chapterGuide })
  } else {
    systemMessages.push({
      role: 'system',
      content: `## 教学规则
- 按节点逐步讲解，每次只讲一个概念
- 讲完一个概念后，询问用户是否继续
- 鼓励用户提问和互动
- 公式请使用 $行内公式$ 或 $$公式块$$ 包裹。行内如 $x^2+y^2=1$，公式块需独占行：
$$
E=mc^2
$$`,
    })
  }

  if (chapter.previousSummary) {
    systemMessages.push({
      role: 'system',
      content: `前面章节的要点总结：\n${chapter.previousSummary}`,
    })
  }

  const rawMessages = await listMessages(chapterId)
  let unsummarized = rawMessages.filter(m => !m.isSummarized)

  const systemTokens = estimateMessagesTokens(systemMessages)
  let totalTokens = 0
  if (chapter.lastTokenCount !== undefined && chapter.lastTokenCount !== null) {
    const lastUserMsg = unsummarized[unsummarized.length - 1]
    const lastUserMsgTokens = lastUserMsg ? estimateTokens(lastUserMsg.content) : 0
    const chunksTokens = retrievedChunks ? retrievedChunks.reduce((sum, c) => sum + estimateTokens(c.content), 0) : 0
    totalTokens = chapter.lastTokenCount + lastUserMsgTokens + chunksTokens
  } else {
    const historyTokens = estimateMessagesTokens(unsummarized.map(m => ({ role: m.role, content: m.content })))
    totalTokens = systemTokens + historyTokens
  }
  const thresholdTokens = contextLength * (compressionThreshold / 100)

  if (provider && model && totalTokens > thresholdTokens && unsummarized.length >= 4) {
    let countToSummarize = Math.floor(unsummarized.length / 2)
    if (countToSummarize % 2 !== 0) {
      countToSummarize += 1
    }
    countToSummarize = Math.min(countToSummarize, unsummarized.length - 2)

    if (countToSummarize > 0) {
      const toSummarize = unsummarized.slice(0, countToSummarize)
      const summaryPrompt = `请对以下对话历史进行简明扼要的摘要总结，归纳讨论的主题和关键结论。控制在400字以内。
如果先前已有关联的摘要，请将新内容与旧摘要合并。
${chapter.historySummary ? `【先前已存摘要】：\n${chapter.historySummary}\n` : ''}
【待摘要的新对话段落】：
${toSummarize.map(m => `${m.role === 'user' ? '用户' : '助理'}: ${m.content}`).join('\n')}`

      try {
        const { chat } = await import('./llm')
        const newSummary = await chat(provider, model, [
          { role: 'system', content: '你是一个对话摘要助手。请客观地总结对话要点，只输出摘要内容，不要加前缀。' },
          { role: 'user', content: summaryPrompt }
        ])

        const { updateChapter, markMessagesAsSummarized } = await import('./db')
        await updateChapter(chapterId, { historySummary: newSummary, lastTokenCount: null })
        await markMessagesAsSummarized(toSummarize.map(m => m.id))

        return assembleChapterContext(chapterId, retrievedChunks, provider, model, contextLength, compressionThreshold)
      } catch (e) {
        console.error('Failed to auto-summarize chat history:', e)
      }
    }
  }

  const historyMessages = unsummarized.map((m) => {
    const baseContent = m.content || ''
    const docText = m.attachments
      ?.filter((a) => a.processedText)
      .map((a) => a.processedText)
      .join('\n\n')
    const content = docText ? baseContent + '\n\n--- 附加内容 ---\n' + docText : baseContent
    return {
      role: m.role as 'user' | 'assistant',
      content: cleanContent(content),
    }
  })

  return { systemMessages, historyMessages }
}

export async function assemblePlanningContext(
  sessionId: string,
  retrievedChunks?: { content: string; docName: string; score: number }[],
  provider?: Provider,
  model?: string,
  contextLength = 256000,
  compressionThreshold = 70
): Promise<ContextAssembly> {
  const session = await getSession(sessionId)
  if (!session) throw new Error('Session not found')
  const { listPlanningMessages } = await import('./db')

  let systemMessages: { role: 'system'; content: string }[] = [
    {
      role: 'system',
      content: `你是一个学习规划助手。你的任务是帮助用户理清学习目标，规划学习路径。
根据对话内容，帮助用户确定学习主题，并在适当的时候建议将知识点划分为章节。
当用户要求生成学习计划时，你需要：
1. 生成一个简洁的学习摘要（2-3句话描述学习目标 and 范围）
2. 根据讨论内容，将知识划分为合理的章节

回复使用markdown格式。公式请使用 $行内公式$ 或 $$公式块$$ 包裹。公式块需独占行：
$$
E=mc^2
$$`,
    },
  ]

  if (session?.planningHistorySummary) {
    systemMessages.push({
      role: 'system',
      content: `以下是先前规划讨论的对话摘要，作为规划背景：\n${session.planningHistorySummary}`,
    })
  }

  if (retrievedChunks && retrievedChunks.length > 0) {
    const kbContent = `## 知识库参考资料（重要）
以下是用户上传的参考资料中与规划对话最相关的片段。在帮助用户理清学习目标并确定章节大纲时，请优先参考以此内容为依据。

${retrievedChunks.map(chunk => `### 来自《${chunk.docName}》 (相关度: ${chunk.score.toFixed(2)})
${chunk.content}`).join('\n\n')}`
    systemMessages.push({
      role: 'system',
      content: kbContent,
    })
  }

  const rawMessages = await listPlanningMessages(sessionId)
  let unsummarized = rawMessages.filter(m => !m.isSummarized)

  const systemTokens = estimateMessagesTokens(systemMessages)
  let totalTokens = 0
  if (session.lastPlanningTokenCount !== undefined && session.lastPlanningTokenCount !== null) {
    const lastUserMsg = unsummarized[unsummarized.length - 1]
    const lastUserMsgTokens = lastUserMsg ? estimateTokens(lastUserMsg.content) : 0
    const chunksTokens = retrievedChunks ? retrievedChunks.reduce((sum, c) => sum + estimateTokens(c.content), 0) : 0
    totalTokens = session.lastPlanningTokenCount + lastUserMsgTokens + chunksTokens
  } else {
    const historyTokens = estimateMessagesTokens(unsummarized.map(m => ({ role: m.role, content: m.content })))
    totalTokens = systemTokens + historyTokens
  }
  const thresholdTokens = contextLength * (compressionThreshold / 100)

  if (provider && model && totalTokens > thresholdTokens && unsummarized.length >= 4) {
    let countToSummarize = Math.floor(unsummarized.length / 2)
    if (countToSummarize % 2 !== 0) {
      countToSummarize += 1
    }
    countToSummarize = Math.min(countToSummarize, unsummarized.length - 2)

    if (countToSummarize > 0) {
      const toSummarize = unsummarized.slice(0, countToSummarize)
      const summaryPrompt = `请对以下规划对话历史进行简明扼要的摘要总结，归纳讨论的学习主题、目标和偏好。控制在400字以内。
如果先前已有关联的摘要，请将新内容与旧摘要合并。
${session.planningHistorySummary ? `【先前已存摘要】：\n${session.planningHistorySummary}\n` : ''}
【待摘要的新规划对话】：
${toSummarize.map(m => `${m.role === 'user' ? '用户' : '助理'}: ${m.content}`).join('\n')}`

      try {
        const { chat } = await import('./llm')
        const newSummary = await chat(provider, model, [
          { role: 'system', content: '你是一个对话摘要助手。请客观地总结对话要点，只输出摘要内容，不要加前缀。' },
          { role: 'user', content: summaryPrompt }
        ])

        const { updateSession, markPlanningMessagesAsSummarized } = await import('./db')
        await updateSession(sessionId, { planningHistorySummary: newSummary, lastPlanningTokenCount: null })
        await markPlanningMessagesAsSummarized(toSummarize.map(m => m.id))

        return assemblePlanningContext(sessionId, retrievedChunks, provider, model, contextLength, compressionThreshold)
      } catch (e) {
        console.error('Failed to auto-summarize planning history:', e)
      }
    }
  }

  const historyMessages = unsummarized.map((m) => {
    const baseContent = m.content || ''
    const docText = m.attachments
      ?.filter((a) => a.processedText)
      .map((a) => a.processedText)
      .join('\n\n')
    const content = docText ? baseContent + '\n\n--- 附加内容 ---\n' + docText : baseContent
    return {
      role: m.role as 'user' | 'assistant',
      content: cleanContent(content),
    }
  })

  return { systemMessages, historyMessages }
}

export function assembleFloatContext(sessionSummary: string): ContextAssembly {
  return {
    systemMessages: [
      {
        role: 'system',
        content: `用户正在学习以下内容：${sessionSummary || '未指定主题'}。请简洁回答用户的问题，帮助理解相关概念。公式请使用 $行内公式$ 或 $$公式块$$ 包裹，公式块需独占行。`,
      },
    ],
    historyMessages: [],
  }
}

export function assembleSummaryContext(messages: { role: string; content: string }[]): ContextAssembly {
  return {
    systemMessages: [
      {
        role: 'system',
        content: `请总结以下对话中讨论的知识要点。以简明扼要的方式列出关键概念和结论，控制在200字以内。只输出总结内容，不要加前缀说明。`,
      },
    ],
    historyMessages: messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: cleanContent(m.content),
    })),
  }
}

export function assembleChapterPlanContext(
  planningMessages: { role: string; content: string }[],
  retrievedChunks?: { content: string; docName: string }[],
  planningHistorySummary?: string | null
): ContextAssembly {
  const systemMessages: { role: 'system'; content: string }[] = []

  if (planningHistorySummary) {
    systemMessages.push({
      role: 'system',
      content: `以下是先前规划讨论的对话摘要，作为生成章节计划的背景信息：\n${planningHistorySummary}`,
    })
  }

  if (retrievedChunks && retrievedChunks.length > 0) {
    const kbContent = `以下是用户上传的参考资料中提取的相关知识片段。在生成学习计划（包括学习标题、目标、摘要及各个章节的标题、描述、目标和大纲）时，请务必参考并融合这些参考资料的内容，以确保学习计划完全贴合用户上传的文档：

${retrievedChunks.map(chunk => `### 来自《${chunk.docName}》:\n${chunk.content}`).join('\n\n')}`
    systemMessages.push({
      role: 'system',
      content: kbContent,
    })
  }

  systemMessages.push({
    role: 'system',
    content: `根据上述规划对话，请完成以下任务：

1. 生成一个50字以内的学习标题
2. 生成一个学习目标描述（一句话）
3. 生成一个学习摘要（2-3句话，描述学习范围和方法）
4. 建议章节划分，每个章节包含：
   - title: 章节标题
   - description: 简短描述（50字内）
   - objectives: 学习目标（本节能学到什么，1-2句话）
   - outline: 大纲要点（用markdown列表列出，如 "- 概念A\n- 概念B\n- 概念C"）

请严格按以下JSON格式回复，不要包含任何其他内容：
{
  "title": "学习标题",
  "goal": "学习目标描述",
  "summary": "学习摘要，2-3句话",
  "chapters": [
    {
      "title": "章节1标题",
      "description": "简短描述",
      "objectives": "学习目标描述",
      "outline": "- 要点1\\n- 要点2\\n- 要点3"
    }
  ]
}`,
  })

  return {
    systemMessages,
    historyMessages: planningMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  }
}
