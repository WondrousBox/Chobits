import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

type Props = {
  content: string
}

export default function MarkdownMessage({ content }: Props) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight as any, { detect: true }]]}
        components={{
          // @ts-ignore
          code({inline, className, children, ...props}) {
            const match = /language-(\w+)/.exec(className || '')
            if (inline) {
              return (
                <code className="px-1 py-0.5 rounded bg-muted font-mono text-[0.9em]" {...props}>
                  {children}
                </code>
              )
            }
            return (
              <pre className="p-3 rounded bg-muted overflow-auto text-sm">
                <code className={`font-mono ${match ? `language-${match[1]}` : ''}`} {...props}>
                  {children}
                </code>
              </pre>
            )
          },
          // @ts-ignore
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table className="table-auto border-collapse">{children}</table>
              </div>
            )
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
