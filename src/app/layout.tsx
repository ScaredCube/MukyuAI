import type { Metadata } from 'next'
import './globals.css'
import 'katex/dist/katex.min.css'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SettingsProvider } from '@/lib/settings-context'

export const metadata: Metadata = {
  title: 'Mukyu AI - 智能学习助手',
  description: '通过AI对话进行结构化学习',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased" style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", "Microsoft YaHei", sans-serif' }}>
        <SettingsProvider>
          <TooltipProvider>
            {children}
            <Toaster richColors />
          </TooltipProvider>
        </SettingsProvider>
      </body>
    </html>
  )
}
