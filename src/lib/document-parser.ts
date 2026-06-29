// Server-only: uses Node.js libraries for document parsing
// Only import this from API routes (server-side), never from client components

const MAX_TEXT_LENGTH = 150000

function sanitizeText(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // strip control chars except \n, \t
    .replace(/\x09/g, ' ')   // tab → space
    .replace(/\r\n/g, '\n')  // normalize line endings
    .replace(/\r/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')  // collapse excessive newlines
    .trim()
}

function limitText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text
  return text.slice(0, MAX_TEXT_LENGTH) + '\n\n[文档内容过长，已截断...]'
}

export async function parseDocumentToText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  if (file.type === 'application/pdf') {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const result = await pdfParse(buffer)
    return sanitizeText(limitText(result.text))
  }

  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return sanitizeText(limitText(result.value))
  }

  if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const texts: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(sheet)
      if (csv.trim()) {
        texts.push(`[${sheetName}]\n${csv.trim()}`)
      }
    }
    return limitText(sanitizeText(texts.join('\n\n')))
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    file.type === 'application/vnd.ms-powerpoint'
  ) {
    return '[PPT/PPTX] 演示文稿文件 - 目前仅支持作为文件直接上传至模型处理'
  }

  if (file.type === 'application/msword' || file.type === 'application/vnd.ms-excel') {
    return `[旧版Office文件] ${file.name} - 请转换为 .docx 或 .xlsx 格式后上传`
  }

  if (file.type === 'text/plain' || file.type === 'text/csv') {
    const decoder = new TextDecoder()
    return sanitizeText(limitText(decoder.decode(buffer)))
  }

  return `[${file.name}] 不支持文本提取此类型文件`
}
