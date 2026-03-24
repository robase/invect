/**
 * MarkdownRenderer — renders markdown content with theme-aware styling.
 *
 * Uses react-markdown + remark-gfm for full GitHub-flavored markdown support.
 * All styles use CSS variables from the tailwind theme so they adapt to
 * light/dark mode automatically.
 */

import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '~/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <div className={cn('chat-markdown w-full min-w-0 overflow-hidden break-words', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Paragraphs
          p: ({ children }) => (
            <p className="mb-2 leading-relaxed break-words last:mb-0">{children}</p>
          ),

          // Headings
          h1: ({ children }) => (
            <h1 className="mt-3 mb-2 text-base font-bold first:mt-0 text-foreground">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold mb-1.5 mt-2.5 first:mt-0 text-foreground">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 mb-1 text-sm font-semibold first:mt-0 text-foreground">
              {children}
            </h3>
          ),

          // Inline code
          code: ({ children, className: codeClassName }) => {
            // Detect if this is inside a <pre> (fenced code block)
            const isBlock = codeClassName?.startsWith('language-');
            if (isBlock) {
              return <code className={cn('text-[11px]', codeClassName)}>{children}</code>;
            }
            return (
              <code className="px-1 py-0.5 rounded-sm bg-muted text-foreground text-[11px] font-medium break-all">
                {children}
              </code>
            );
          },

          // Code blocks
          pre: ({ children }) => (
            <pre className="mb-2 last:mb-0 p-2.5 rounded-sm bg-muted border border-border text-[11px] leading-relaxed overflow-x-auto max-w-full">
              {children}
            </pre>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="mb-2 last:mb-0 pl-6 list-disc space-y-0.5 marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 last:mb-0 pl-6 list-decimal space-y-0.5 marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed break-words">{children}</li>,

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="pl-3 mb-2 italic border-l-2 last:mb-0 border-border text-muted-foreground">
              {children}
            </blockquote>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors text-primary underline-offset-2 hover:text-foreground"
            >
              {children}
            </a>
          ),

          // Bold & emphasis
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,

          // Horizontal rule
          hr: () => <hr className="my-3 border-border" />,

          // Tables
          table: ({ children }) => (
            <div className="max-w-full mb-2 overflow-x-auto last:mb-0">
              <table className="w-full text-[11px] border-collapse border border-border">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
          th: ({ children }) => (
            <th className="px-2 py-1 font-semibold text-left border border-border text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="px-2 py-1 border border-border">{children}</td>,

          // Images — basic support
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt ?? ''}
              className="max-w-full my-1 border rounded-sm border-border"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
