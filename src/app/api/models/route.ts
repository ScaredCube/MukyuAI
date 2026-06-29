import { NextRequest, NextResponse } from 'next/server'
import type { ProviderType } from '@/lib/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, baseUrl, apiKey } = body as { type: ProviderType; baseUrl: string; apiKey: string }

  try {
    if (type === 'openai') {
      const url = `${baseUrl.replace(/\/$/, '')}/models`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        return NextResponse.json({ error: `HTTP ${res.status}: ${await res.text().catch(() => '')}` }, { status: 400 })
      }
      const data = await res.json()
      const models = (data.data || [])
        .filter((m: { id: string }) => {
          const id = m.id.toLowerCase()
          return !id.includes('dall-e') && !id.includes('tts') && !id.includes('whisper') && !id.includes('embedding') && !id.includes('moderation')
        })
        .map((m: { id: string }) => ({ id: m.id, displayName: m.id }))
        .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))
      return NextResponse.json({ models })
    }

    if (type === 'anthropic') {
      // Anthropic doesn't have a models listing API
      return NextResponse.json({ models: [] })
    }

    if (type === 'google') {
      // Google Gemini models - try to list
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (res.ok) {
          const data = await res.json()
          const models = (data.models || [])
            .filter((m: { name: string }) => m.name.includes('gemini'))
            .map((m: { name: string }) => {
              const id = m.name.replace('models/', '')
              return { id, displayName: id }
            })
          return NextResponse.json({ models })
        }
      } catch { /* fallback */ }
      return NextResponse.json({ models: [] })
    }

    return NextResponse.json({ models: [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error', models: [] }, { status: 200 })
  }
}
