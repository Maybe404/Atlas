import { useCallback, useRef, useState } from 'react';
import { I } from '../chrome';
import { usePublicDocument } from '../data-hooks';
import type { Loose } from '../loose-types';
import { EmptyState, Skeleton } from '../ui-kit';
import { MarkdownReader } from './markdown-reader';
import { dotClass } from './shared';

export function PublicDocumentView({ token, onChromeScroll }: Loose) {
  const iframeRef = useRef<Loose>(null);
  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const bindIframeScroll = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.addEventListener('scroll', onChromeScroll, {
        passive: true,
      });
    } catch (_e) {}
  }, [onChromeScroll]);
  const publicQuery = usePublicDocument(token, Boolean(token));
  const doc = publicQuery.data;

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
      <div className="reader-meta-bar">
        <span className={`dot ${dotClass(doc.dot || 'slate')}`}></span>
        <span className="doc-title">{doc.title}</span>
        <span className="sep">·</span>
        <span className="author">{doc.authorName || '公开文档'}</span>
        <span className="sep">·</span>
        <span className="mono dim" style={{ fontSize: 11 }}>
          {doc.updated}
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" className="pill-btn ghost" onClick={copyLink}>
          {copied ? <I.check /> : <I.link />}
          <span>{copied ? '已复制' : '复制链接'}</span>
        </button>
      </div>
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
            onLoad={bindIframeScroll}
          />
        )}
      </div>
    </div>
  );
}
