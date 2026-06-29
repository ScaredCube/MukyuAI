import { NextRequest, NextResponse } from 'next/server'
import { getFileCategory, validateFile } from '@/lib/file-utils'
import { parseDocumentToText } from '@/lib/document-parser'
import { v4 as uuidv4 } from 'uuid'
import type { Attachment } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    const documentParsingMethod = (formData.get('documentParsingMethod') as string) || 'text'

    if (files.length === 0) {
      return NextResponse.json({ error: '没有文件' }, { status: 400 })
    }

    const attachments: Attachment[] = []

    for (const file of files) {
      const validation = validateFile(file)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      const arrayBuffer = await file.arrayBuffer()
      const base64Data = Buffer.from(arrayBuffer).toString('base64')
      const category = getFileCategory(file.type)

      const attachment: Attachment = {
        id: uuidv4(),
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        data: base64Data,
      }

      if (category === 'document') {
        try {
          attachment.processedText = await parseDocumentToText(file)
        } catch (e) {
          attachment.processedText = `[${file.name}] 文本提取失败: ${e instanceof Error ? e.message : '未知错误'}`
        }
      }

      attachments.push(attachment)
    }

    return NextResponse.json({ attachments })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '文件处理失败' },
      { status: 500 }
    )
  }
}
