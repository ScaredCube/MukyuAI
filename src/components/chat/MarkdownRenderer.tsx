'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'

function CodeBlock({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const isInline = !match && !String(children).includes('\n')

  if (isInline) {
    return (
      <code className={cn('bg-muted px-1.5 py-0.5 rounded text-sm font-mono', className)} {...props}>
        {children}
      </code>
    )
  }

  return (
    <div className="my-4 rounded-lg border overflow-hidden">
      {language && (
        <div className="bg-muted px-4 py-1.5 text-xs text-muted-foreground font-mono border-b">
          {language}
        </div>
      )}
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.85rem',
          lineHeight: 1.6,
        }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  )
}

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code: CodeBlock,
          hr: () => (
            <hr className="my-6 border-border" />
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border bg-muted px-3 py-2 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border px-3 py-2">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
