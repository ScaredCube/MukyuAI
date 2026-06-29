'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Provider, AppSettings } from '@/lib/types'

const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: 'openai-default',
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: [
      { id: 'gpt-4o', displayName: 'GPT-4o' },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', displayName: 'GPT-4 Turbo' },
    ],
  },
  {
    id: 'anthropic-default',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    models: [
      { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' },
      { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
    ],
  },
  {
    id: 'google-default',
    name: 'Google Gemini',
    type: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKey: '',
    models: [
      { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
    ],
  },
]

const DEFAULT_SETTINGS: AppSettings = {
  currentProviderId: 'openai-default',
  selectedModelId: 'gpt-4o',
  providers: DEFAULT_PROVIDERS,
  imageParsingMethod: 'direct',
  documentParsingMethod: 'text',
  contextLength: 256000,
  compressionThreshold: 70,
}

const SettingsContext = createContext<{
  settings: AppSettings
  updateSettings: (s: AppSettings) => void
  getCurrentProvider: () => Provider | undefined
  getCurrentModel: () => string
}>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
  getCurrentProvider: () => undefined,
  getCurrentModel: () => '',
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('mukyu-ai-settings-v2')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setSettings({
          currentProviderId: parsed.currentProviderId || DEFAULT_SETTINGS.currentProviderId,
          selectedModelId: parsed.selectedModelId || DEFAULT_SETTINGS.selectedModelId,
          providers: parsed.providers || DEFAULT_SETTINGS.providers,
          imageParsingMethod: parsed.imageParsingMethod || DEFAULT_SETTINGS.imageParsingMethod,
          documentParsingMethod: parsed.documentParsingMethod || DEFAULT_SETTINGS.documentParsingMethod,
          externalImageModel: parsed.externalImageModel ?? undefined,
          embeddingConfig: parsed.embeddingConfig ?? undefined,
          contextLength: typeof parsed.contextLength === 'number' ? parsed.contextLength : DEFAULT_SETTINGS.contextLength,
          compressionThreshold: typeof parsed.compressionThreshold === 'number' ? parsed.compressionThreshold : DEFAULT_SETTINGS.compressionThreshold,
        })
      } catch { /* ignore */ }
    }
    setMounted(true)
  }, [])

  const updateSettings = (s: AppSettings) => {
    setSettings(s)
    localStorage.setItem('mukyu-ai-settings-v2', JSON.stringify(s))
  }

  const getCurrentProvider = () => settings.providers.find((p) => p.id === settings.currentProviderId)
  const getCurrentModel = () => settings.selectedModelId || ''

  if (!mounted) {
    return (
      <SettingsContext.Provider value={{ settings: DEFAULT_SETTINGS, updateSettings, getCurrentProvider, getCurrentModel }}>
        {children}
      </SettingsContext.Provider>
    )
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, getCurrentProvider, getCurrentModel }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
