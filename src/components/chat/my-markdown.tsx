import { open } from '@tauri-apps/plugin-shell';
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import '@/styles/highlight.css';
import MemoizedCodeBlock from './code-block';

function MyMarkdown({ content }: { content: string }) {
  return (
    <div>
      <ReactMarkdown
        components={{
          // Open external links in default browser
          a: ({ node, href, children, ...props }) => (
            <a
              href={href}
              onClick={(e) => {
                if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                  e.preventDefault();
                  open(href);
                }
              }}
              className="text-primary hover:underline"
              {...props}
            >
              {children}
            </a>
          ),
          p: ({ node, ...props }) => <p dir="auto" {...props} />,
          li: ({ node, ...props }) => <li dir="auto" {...props} />,
          pre: ({ node, children, ...props }) => (
            <MemoizedCodeBlock {...props}>{children}</MemoizedCodeBlock>
          ),
          // Theme-aware table styling
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-border" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th
              className="border border-border bg-muted/50 px-4 py-2 text-left font-medium"
              {...props}
            />
          ),
          td: ({ node, ...props }) => <td className="border border-border px-4 py-2" {...props} />,
          // Theme-aware blockquote
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-muted-foreground/30 border-l-4 pl-4 text-muted-foreground italic"
              {...props}
            />
          ),
          // Theme-aware horizontal rule
          hr: ({ node, ...props }) => <hr className="my-6 border-border" {...props} />,
        }}
        rehypePlugins={[
          [
            rehypeHighlight as never,
            {
              detect: false,
              ignoreMissing: true,
            },
          ],
        ]}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MyMarkdown);
