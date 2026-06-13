import { useEffect, useRef, useState } from 'react';
import type { Loose } from '../loose-types';
import { enhance, renderMarkdown } from '../markdown/renderer';

export function MarkdownReader({ content, onScroll }: Loose) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    renderMarkdown(content || '')
      .then((out) => {
        if (alive) {
          setHtml(out);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [content]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: html triggers enhance after new content is set
  useEffect(() => {
    if (!loading && ref.current) enhance(ref.current);
  }, [loading, html]);

  if (loading) return <div className="app-state-banner">正在渲染 Markdown…</div>;
  return (
    <div className="md-scroll" onScroll={onScroll} style={{ height: '100%', overflow: 'auto' }}>
      {/* content already sanitized by renderer's DOMPurify pass */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: content already sanitized by renderer's DOMPurify pass */}
      <div className="md-body" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
