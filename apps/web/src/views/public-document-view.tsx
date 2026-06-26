import { useEffect, useRef } from 'react';
import { usePublicDocument } from '../data-hooks';
import type { Loose } from '../loose-types';
import { getScroll, setScroll } from '../reader-progress';
import { EmptyState, Skeleton } from '../ui-kit';
import { MarkdownReader } from './markdown-reader';

export function PublicDocumentView({ token, onChromeScroll }: Loose) {
  const iframeRef = useRef<Loose>(null);
  const publicQuery = usePublicDocument(token, Boolean(token));
  const doc = publicQuery.data;

  // The HTML iframe is a sandboxed opaque origin, so it talks to us only via postMessage
  // (lib/raw-html's CHROME_BRIDGE). On 'ready' we hand back an article masthead built from
  // the public metadata — authorName is already null when the share link hides the author,
  // so the byline simply drops it — plus the saved scroll offset; on 'scroll' we remember
  // the reading position. Markdown renders its own masthead and tracks its own scroll.
  const scrollKey = doc?.id;
  const isHtml = doc && doc.format !== 'markdown';
  const eyebrow = doc?.spaceName;
  const mTitle = doc?.title;
  const mAuthor = doc?.authorName;
  const mDate = doc?.updated;
  useEffect(() => {
    if (!isHtml) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as Loose;
      if (!d || d.source !== 'atlas-reader') return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (d.type === 'ready') {
        iframeRef.current?.contentWindow?.postMessage(
          {
            source: 'atlas-host',
            type: 'init',
            masthead: {
              eyebrow,
              title: mTitle,
              byline: [mAuthor, mDate, 'HTML'].filter(Boolean),
            },
            restoreTop: getScroll(scrollKey),
          },
          '*',
        );
      } else if (d.type === 'scroll') {
        setScroll(scrollKey, d.top || 0);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [isHtml, scrollKey, eyebrow, mTitle, mAuthor, mDate]);

  if (publicQuery.isLoading) {
    return (
      <div className="main-card reader-card">
        <div className="reader-skeleton" role="status" aria-label="正在加载公开文档">
          <Skeleton w="60%" h={28} r={6} />
          <Skeleton w="40%" h={14} r={4} />
          <div className="reader-skeleton-body">
            <Skeleton w="100%" h={12} />
            <Skeleton w="92%" h={12} />
            <Skeleton w="78%" h={12} />
            <Skeleton w="85%" h={12} />
            <Skeleton w="60%" h={12} />
          </div>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="main-card reader-card">
        <EmptyState
          glyph={
            <svg viewBox="0 0 56 56" fill="none" aria-hidden="true">
              <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="2" />
              <path
                d="M20 20l16 16M36 20L20 36"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          }
          title="公开链接不可用或已过期"
          desc="这篇文档的公开分享可能已被撤销、已过期，或链接有误。请联系文档作者获取新的链接。"
        />
      </div>
    );
  }

  return (
    <div className="main-card reader-card">
      <div className="reader-iframe-wrap" onScroll={onChromeScroll}>
        {doc.format === 'markdown' ? (
          <MarkdownReader content={doc.html || ''} onScroll={onChromeScroll} tocPanel />
        ) : (
          <iframe
            ref={iframeRef}
            className="reader-iframe"
            // Same-origin raw endpoint (not srcDoc/blob) so in-page TOC anchors scroll instead of
            // blanking the frame. Stays sandboxed; the endpoint sends its own sandbox CSP.
            src={`/api/documents/public/${token}/raw`}
            title={doc.title}
            sandbox="allow-scripts allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  );
}
