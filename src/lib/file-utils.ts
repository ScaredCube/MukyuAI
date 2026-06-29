import { v4 as uuidv4 } from 'uuid'
import type { Attachment } from './types'

export const MAX_FILE_SIZE = 30 * 1024 * 1024

const IMAGE_MIME_PREFIXES = ['image/']

export function isImageMime(mimeType: string): boolean {
  return IMAGE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
}

export function getFileCategory(mimeType: string): 'image' | 'document' {
  if (isImageMime(mimeType)) return 'image'
  return 'document'
}

export function isAllowedFileType(mimeType: string): boolean {
  if (isImageMime(mimeType)) return true
  const docTypes = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'text/plain',
    'text/csv',
  ])
  return docTypes.has(mimeType)
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `文件 "${file.name}" 超过30MB限制 (${formatBytes(file.size)})` }
  }
  if (!isAllowedFileType(file.type)) {
    return { valid: false, error: `不支持的文件类型: ${file.type || '未知'} - 文件 "${file.name}"` }
  }
  return { valid: true }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

export function blobToBase64(blob: Blob): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const parts = result.split(',')
      const mimeType = parts[0].match(/data:(.+);base64/)?.[1] || 'image/png'
      resolve({ data: parts[1], mimeType })
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

export function createImagePreview(base64Data: string, mimeType: string, maxDim = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas context failed')); return }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => reject(new Error('图片预处理失败'))
    img.src = `data:${mimeType};base64,${base64Data}`
  })
}

export function buildDataUrl(base64Data: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64Data}`
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  const base64Data = await fileToBase64(file)
  const category = getFileCategory(file.type)
  let previewData: string | undefined

  if (category === 'image') {
    try {
      previewData = await createImagePreview(base64Data, file.type)
    } catch { /* ignore preview failures */ }
  }

  return {
    id: uuidv4(),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    data: base64Data,
    previewData,
  }
}
