import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { apiGet } from '../api-client';
import type { Loose } from '../loose-types';
import { MarkdownReader } from './markdown-reader';
import { dotClass } from './shared';

export function PublicDocumentView({ token, onChromeScroll }: Loose) {
  const iframeRef = useRef<Loose>(null);
  const bindIframeScroll = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.addEventListener('scroll', onChromeScroll, {
        passive: true,
      });
    } catch (_e) {}
  }, [onChromeScroll]);
  const publicQuery = useQuery({
    queryKey: ['public-document', token],
    queryFn: () => apiGet(`/documents/public/${token}`),
    enabled: Boolean(token),
  });
  const doc = publicQuery.data;

  if (publicQuery.isLoading) {
    return (
      <div className="main-card reader-card">
        <div className="app-state-banner">正在打开公开文档…</div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="main-card reader-card">
        <div className="app-state-banner">公开链接不可用或已过期</div>
      </div>
    );
  }

  return (
    <div className="main-card reader-card">
      <div className="reader-meta-bar">
        <span className={`dot ${dotClass(doc.dot || 'slate')}`}></span>
        <span className="doc-title">{doc.title}</span>
        <span className="sep">·</span>
        <span className="author">{doc.authorName || '公开文档'}</span>
        <span className="sep">·</span>
        <span className="mono dim" style={{ fontSize: 11 }}>
          {doc.updated}
        </span>
      </div>
      <div className="reader-iframe-wrap" onScroll={onChromeScroll}>
        {doc.format === 'markdown' ? (
          <MarkdownReader content={doc.html || ''} onScroll={onChromeScroll} tocPanel />
        ) : (
          <iframe
            ref={iframeRef}
            className="reader-iframe"
            srcDoc={doc.html || '<!doctype html><html><body><p>暂无内容</p></body></html>'}
            title={doc.title}
            sandbox="allow-scripts allow-forms allow-popups"
            onLoad={bindIframeScroll}
          />
        )}
      </div>
    </div>
  );
}
