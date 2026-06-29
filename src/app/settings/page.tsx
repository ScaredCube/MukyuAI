'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Eye, EyeOff, RefreshCw, Check, X, Edit2, Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSettings } from '@/lib/settings-context'
import { toast } from 'sonner'
import type { Provider, ProviderType, ImageParsingMethod, DocumentParsingMethod, EmbeddingConfig } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'

const TYPE_LABELS: Record<ProviderType, string> = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google Gemini' }
const TYPE_DEFAULTS: Record<ProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com',
}

export default function SettingsPage() {
  const router = useRouter()
  const { settings, updateSettings } = useSettings()
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [scanning, setScanning] = useState<string | null>(null)
  const [showEmbeddingKey, setShowEmbeddingKey] = useState(false)

  const toggleKey = (id: string) => setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))

  const updateEmbeddingConfig = (field: keyof EmbeddingConfig, value: any) => {
    const current = settings.embeddingConfig || {
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'text-embedding-3-small',
    }
    const next = { ...current, [field]: value }
    updateSettings({ ...settings, embeddingConfig: next })
  }

  const updateProvider = (updated: Provider) => {
    updateSettings({
      ...settings,
      providers: settings.providers.map((p) => (p.id === updated.id ? updated : p)),
    })
    if (editingProvider?.id === updated.id) setEditingProvider(updated)
  }

  const addProvider = () => {
    const p: Provider = {
      id: uuidv4(),
      name: '新供应商',
      type: 'openai',
      baseUrl: TYPE_DEFAULTS.openai,
      apiKey: '',
      models: [],
    }
    updateSettings({ ...settings, providers: [...settings.providers, p] })
    setEditingProvider(p)
  }

  const deleteProvider = (id: string) => {
    if (!confirm('确定删除此供应商？')) return
    const providers = settings.providers.filter((p) => p.id !== id)
    const nextSettings = { ...settings, providers }
    if (settings.currentProviderId === id) {
      nextSettings.currentProviderId = providers[0]?.id || null
      nextSettings.selectedModelId = providers[0]?.models[0]?.id || null
    }
    if (settings.externalImageModel?.providerId === id) {
      nextSettings.externalImageModel = undefined
    }
    updateSettings(nextSettings)
    if (editingProvider?.id === id) setEditingProvider(null)
  }

  const scanModels = async (provider: Provider) => {
    if (!provider.apiKey) { toast.error('请先填写 API Key'); return }
    setScanning(provider.id)
    try {
      const res = await fetch('/api/models', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: provider.type, baseUrl: provider.baseUrl, apiKey: provider.apiKey }),
      })
      const data = await res.json()
      if (data.models?.length > 0) {
        updateProvider({ ...provider, models: data.models })
        toast.success(`扫描到 ${data.models.length} 个模型`)
      } else {
        toast.info('未扫描到模型，请手动添加')
      }
    } catch { toast.error('扫描失败') }
    finally { setScanning(null) }
  }

  const addModel = (provider: Provider) => {
    const id = prompt('输入模型 ID：')
    if (!id) return
    const name = prompt('输入显示名称（可选）：', id) || id
    updateProvider({ ...provider, models: [...provider.models, { id, displayName: name }] })
  }

  const removeModel = (provider: Provider, modelId: string) => {
    const models = provider.models.filter((m) => m.id !== modelId)
    const updated = { ...provider, models }
    updateProvider(updated)
    if (settings.currentProviderId === provider.id && settings.selectedModelId === modelId) {
      updateSettings({ ...settings, selectedModelId: models[0]?.id || null })
    }
    if (settings.externalImageModel?.providerId === provider.id && settings.externalImageModel?.modelId === modelId) {
      updateSettings({ ...settings, externalImageModel: undefined })
    }
  }

  const setCurrentProvider = (provider: Provider) => {
    updateSettings({
      ...settings,
      currentProviderId: provider.id,
      selectedModelId: provider.models[0]?.id || null,
    })
    toast.success(`已切换到 ${provider.name}`)
  }

  const setImageParsingMethod = (method: ImageParsingMethod) => {
    const next = { ...settings, imageParsingMethod: method }
    if (method === 'direct') {
      next.externalImageModel = undefined
    }
    updateSettings(next)
  }

  const setDocumentParsingMethod = (method: DocumentParsingMethod) => {
    updateSettings({ ...settings, documentParsingMethod: method })
  }

  const setExternalImageModelProvider = (providerId: string) => {
    const provider = settings.providers.find((p) => p.id === providerId)
    updateSettings({
      ...settings,
      externalImageModel: {
        providerId,
        modelId: provider?.models[0]?.id || '',
      },
    })
  }

  const setExternalImageModelModel = (modelId: string) => {
    updateSettings({
      ...settings,
      externalImageModel: settings.externalImageModel
        ? { ...settings.externalImageModel, modelId }
        : undefined,
    })
  }

  const exportSettings = () => {
    try {
      const dataStr = JSON.stringify(settings, null, 2)
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)
      const exportFileDefaultName = `mukyu-ai-settings-${new Date().toISOString().slice(0, 10)}.json`
      const linkElement = document.createElement('a')
      linkElement.setAttribute('href', dataUri)
      linkElement.setAttribute('download', exportFileDefaultName)
      linkElement.click()
      toast.success('设置导出成功')
    } catch {
      toast.error('导出失败')
    }
  }

  const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader()
    const file = e.target.files?.[0]
    if (!file) return

    fileReader.onload = (event) => {
      try {
        const fileContent = event.target?.result as string
        const parsed = JSON.parse(fileContent)

        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('无效的设置格式')
        }

        updateSettings(parsed)
        toast.success('设置导入成功，页面将自动刷新')
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } catch (err) {
        toast.error('导入失败：文件格式不正确')
      }
    }

    fileReader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b px-4 py-3 flex items-center gap-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold flex-1">API 供应商管理</h1>
        <Button onClick={addProvider}><Plus className="h-4 w-4 mr-1" />添加供应商</Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
          {settings.providers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              还没有供应商，点击"添加供应商"开始
            </div>
          )}

          {settings.providers.map((provider) => (
            <div key={provider.id} className="border rounded-lg p-4 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {editingProvider?.id === provider.id ? (
                    <Input
                      value={editingProvider.name}
                      onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
                      className="w-40 text-sm font-semibold"
                    />
                  ) : (
                    <h3 className="font-semibold">{provider.name}</h3>
                  )}
                  <span className={settings.currentProviderId === provider.id ? 'bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded' : 'bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded'}>
                    {TYPE_LABELS[provider.type]}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {settings.currentProviderId !== provider.id && (
                    <Button variant="outline" size="sm" onClick={() => setCurrentProvider(provider)}>使用此供应商</Button>
                  )}
                  {settings.currentProviderId === provider.id && (
                    <span className="text-xs text-muted-foreground mr-2">当前使用中</span>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => setEditingProvider(editingProvider?.id === provider.id ? null : { ...provider })}
                  >
                    {editingProvider?.id === provider.id ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteProvider(provider.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Edit fields */}
              {editingProvider?.id === provider.id && (
                <div className="space-y-3 pl-2 border-l-2">
                  <div className="space-y-1">
                    <Label className="text-xs">类型</Label>
                    <select
                      value={editingProvider.type}
                      onChange={(e) => setEditingProvider({ ...editingProvider, type: e.target.value as ProviderType, baseUrl: TYPE_DEFAULTS[e.target.value as ProviderType] })}
                      className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
                    >
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Base URL</Label>
                    <Input
                      value={editingProvider.baseUrl}
                      onChange={(e) => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">API Key</Label>
                    <div className="relative">
                      <Input
                        type={showKeys[provider.id] ? 'text' : 'password'}
                        value={editingProvider.apiKey}
                        onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
                        className="text-sm pr-10"
                        placeholder="输入 API Key..."
                      />
                      <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => toggleKey(provider.id)}>
                        {showKeys[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => { updateProvider(editingProvider); setEditingProvider(null); toast.success('已保存') }}>保存</Button>
                </div>
              )}

              {/* Models */}
              {!editingProvider && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">模型列表</Label>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => scanModels(provider)} disabled={scanning === provider.id}>
                        <RefreshCw className={scanning === provider.id ? 'animate-spin h-3 w-3 mr-1' : 'h-3 w-3 mr-1'} />
                        扫描
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addModel(provider)}>
                        <Plus className="h-3 w-3 mr-1" />添加
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.models.map((m) => (
                      <span
                        key={m.id}
                        onClick={() => {
                          updateSettings({ ...settings, currentProviderId: provider.id, selectedModelId: m.id })
                          toast.success(`已选择 ${m.displayName}`)
                        }}
                        className={`inline-flex items-center gap-1 text-xs border rounded-md px-2 py-1 cursor-pointer transition-colors ${
                          settings.currentProviderId === provider.id && settings.selectedModelId === m.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'hover:bg-muted'
                        }`}
                      >
                        {m.displayName}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeModel(provider, m.id) }}
                          className="hover:text-destructive"
                        ><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    {provider.models.length === 0 && (
                      <span className="text-xs text-muted-foreground">暂无模型，请扫描或手动添加</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 图片解析设置 */}
          <Separator />
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold">图片解析方式</h3>
            <p className="text-xs text-muted-foreground">选择如何处理发送给AI的图片</p>
            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="imageParsing"
                  className="mt-0.5"
                  checked={settings.imageParsingMethod === 'direct'}
                  onChange={() => setImageParsingMethod('direct')}
                />
                <div>
                  <div className="text-sm font-medium">直接上传给模型</div>
                  <div className="text-xs text-muted-foreground">将图片直接发送给当前对话模型（需模型支持视觉）</div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="imageParsing"
                  className="mt-0.5"
                  checked={settings.imageParsingMethod === 'external'}
                  onChange={() => setImageParsingMethod('external')}
                />
                <div>
                  <div className="text-sm font-medium">外挂图像理解模型</div>
                  <div className="text-xs text-muted-foreground">使用专门的视觉模型先理解图片，再将文字描述发给对话模型</div>
                </div>
              </label>
            </div>

            {settings.imageParsingMethod === 'external' && (
              <div className="pl-6 pt-2 space-y-2">
                <Label className="text-xs">图像理解模型</Label>
                <div className="flex gap-2">
                  <select
                    className="border rounded-md px-2 py-1.5 text-sm bg-background flex-1"
                    value={settings.externalImageModel?.providerId || ''}
                    onChange={(e) => setExternalImageModelProvider(e.target.value)}
                  >
                    <option value="">选择供应商</option>
                    {settings.providers.filter((p) => p.apiKey).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {settings.externalImageModel?.providerId && (
                    <select
                      className="border rounded-md px-2 py-1.5 text-sm bg-background flex-1"
                      value={settings.externalImageModel?.modelId || ''}
                      onChange={(e) => setExternalImageModelModel(e.target.value)}
                    >
                      <option value="">选择模型</option>
                      {settings.providers
                        .find((p) => p.id === settings.externalImageModel?.providerId)
                        ?.models.map((m) => (
                          <option key={m.id} value={m.id}>{m.displayName}</option>
                        ))}
                    </select>
                  )}
                </div>
                {settings.providers.filter((p) => p.apiKey).length === 0 && (
                  <p className="text-xs text-muted-foreground">请先在上方配置至少一个带 API Key 的供应商</p>
                )}
              </div>
            )}
          </div>

          {/* 文档解析设置 */}
          <Separator />
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold">文档解析方式</h3>
            <p className="text-xs text-muted-foreground">选择如何处理 PDF、Word、Excel、PPT 等文档文件</p>
            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="documentParsing"
                  className="mt-0.5"
                  checked={settings.documentParsingMethod === 'text'}
                  onChange={() => setDocumentParsingMethod('text')}
                />
                <div>
                  <div className="text-sm font-medium">解析为纯文本</div>
                  <div className="text-xs text-muted-foreground">本地提取文档中的文字内容，作为文本发送给模型</div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="documentParsing"
                  className="mt-0.5"
                  checked={settings.documentParsingMethod === 'direct'}
                  onChange={() => setDocumentParsingMethod('direct')}
                />
                <div>
                  <div className="text-sm font-medium">直接上传文件</div>
                  <div className="text-xs text-muted-foreground">将文件直接发送给模型处理（需模型支持文件上传）</div>
            </div>
          </label>
            </div>
          </div>

          {/* 知识库向量化配置 (Embedding) */}
          <Separator />
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">知识库向量化配置 (Embedding)</h3>
            <p className="text-xs text-muted-foreground">配置用于知识库文档向量化的 Embedding 模型，以支持参考文档的切片和检索。</p>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">供应商类型</Label>
                <select
                  value={settings.embeddingConfig?.providerType || 'openai'}
                  onChange={(e) => {
                    const type = e.target.value as 'openai' | 'google'
                    updateEmbeddingConfig('providerType', type)
                    updateEmbeddingConfig('baseUrl', type === 'google' ? 'https://generativelanguage.googleapis.com' : 'https://api.openai.com/v1')
                    updateEmbeddingConfig('model', type === 'google' ? 'text-embedding-004' : 'text-embedding-3-small')
                  }}
                  className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
                >
                  <option value="openai">OpenAI 兼容</option>
                  <option value="google">Google Gemini</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Base URL</Label>
                <Input
                  value={settings.embeddingConfig?.baseUrl ?? ''}
                  onChange={(e) => updateEmbeddingConfig('baseUrl', e.target.value)}
                  placeholder="如 https://api.openai.com/v1"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">API Key</Label>
                <div className="relative">
                  <Input
                    type={showEmbeddingKey ? 'text' : 'password'}
                    value={settings.embeddingConfig?.apiKey ?? ''}
                    onChange={(e) => updateEmbeddingConfig('apiKey', e.target.value)}
                    className="text-sm pr-10"
                    placeholder="输入 API Key..."
                  />
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowEmbeddingKey(!showEmbeddingKey)}>
                    {showEmbeddingKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">模型名称 (Model)</Label>
                <Input
                  value={settings.embeddingConfig?.model ?? ''}
                  onChange={(e) => updateEmbeddingConfig('model', e.target.value)}
                  placeholder="如 text-embedding-3-small 或 text-embedding-004"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">向量维度 (Dimensions - 可选)</Label>
                <Input
                  type="number"
                  value={settings.embeddingConfig?.dimensions ?? ''}
                  onChange={(e) => updateEmbeddingConfig('dimensions', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="留空使用模型默认维度"
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* 上下文与自动摘要配置 */}
          <Separator />
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">上下文与历史自动摘要</h3>
            <p className="text-xs text-muted-foreground">配置模型的最大上下文长度，以及当对话历史占用量达到设定阈值时，自动触发历史摘要压缩，以降低 Token 消耗并缓解长对话上下文不足的问题。</p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">模型 Context 长度 (Tokens)</Label>
                <Input
                  type="number"
                  value={settings.contextLength ?? 256000}
                  onChange={(e) => updateSettings({
                    ...settings,
                    contextLength: e.target.value ? parseInt(e.target.value) : 256000
                  })}
                  placeholder="默认 256000"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">压缩触发阈值 (%)</Label>
                <Input
                  type="number"
                  min={10}
                  max={95}
                  value={settings.compressionThreshold ?? 70}
                  onChange={(e) => updateSettings({
                    ...settings,
                    compressionThreshold: e.target.value ? parseInt(e.target.value) : 70
                  })}
                  placeholder="默认 70"
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* 备份与恢复配置 */}
          <Separator />
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">备份与恢复</h3>
            <p className="text-xs text-muted-foreground">导出当前的供应商、模型和所有设置到本地文件，或从备份文件导入配置。</p>
            
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={exportSettings}>
                <Download className="h-4 w-4 mr-1.5" />
                导出设置
              </Button>
              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={importSettings}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-1.5" />
                  导入设置
                </Button>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
