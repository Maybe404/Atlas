import { useCallback, useRef, useState } from 'react';
import { useNavigate as useRouterNavigate } from 'react-router';
import { canRead, firstPublicDoc } from '../auth';
import { I } from '../chrome';
import { useDocument } from '../data-hooks';
import type { Loose } from '../loose-types';
import { copyMarkdownRich, copyMarkdownSource } from '../markdown/copy';
import { getScroll, setScroll } from '../reader-progress';
import { Skeleton } from '../ui-kit';
import { useHtmlBlobUrl } from '../use-html-blob';
import { MarkdownEditorDialog } from './markdown-editor-dialog';
import { MarkdownReader } from './markdown-reader';
import { dotClass } from './shared';

const _I = I;

export function ReaderView({
  ctx,
  spaces = [],
  members = [],
  user,
  framedDoc,
  chromeVisible = true,
  onNavigate,
  onShare,
  onLogin,
  onChromeScroll,
  mutations,
}: Loose) {
  const routerNavigate = useRouterNavigate();
  const requestedSpace = spaces.find((s: Loose) => s.id === ctx.spaceId);
  const space = requestedSpace || spaces[0];
  const requestedDoc = requestedSpace?.children?.find((c: Loose) => c.id === ctx.docId);
  const doc =
    requestedDoc || (requestedSpace ? requestedSpace.children?.[0] : space?.children?.[0]);
  const denied = Boolean(user && ctx.spaceId && ctx.docId && (!requestedSpace || !requestedDoc));
  const allowed = !denied && canRead(doc, user);
  const detailQuery = useDocument(doc?.id, Boolean(allowed && doc?.id));
  const detailDoc = detailQuery.data || doc;
  const detailDenied = allowed && detailQuery.isError;
  const author =
    allowed && detailDoc?.author ? members.find((m: Loose) => m.id === detailDoc.author) : null;
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copiedMode, setCopiedMode] = useState('');
  // Guests can only enter published docs through /share/:token (the /spaces/:id/docs/:id route
  // rejects anonymous readers). Members fall through to the regular /spaces/:id/docs/:id URL.
  const browsePublic = useCallback(() => {
    const target = firstPublicDoc(spaces as never);
    if (!user && target.shareToken) {
      routerNavigate(`/share/${target.shareToken}`);
      return;
    }
    onNavigate({ view: 'reader', spaceId: target.spaceId, docId: target.docId });
  }, [onNavigate, routerNavigate, spaces, user]);
  const isMarkdown = detailDoc?.format === 'markdown';
  const doCopy = async (mode: 'source' | 'rich') => {
    try {
      const src = detailDoc?.html || '';
      if (mode === 'source') await copyMarkdownSource(src);
      else await copyMarkdownRich(src);
      setCopiedMode(mode);
      setTimeout(() => setCopiedMode(''), 1400);
    } catch {}
  };
  const readerLink = window.location.href;
  const copyReaderLink = () => {
    navigator.clipboard?.writeText(readerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const iframeRef = useRef<Loose>(null);
  const scrollKey = detailDoc?.id || doc?.id;
  const bindIframeScroll = useCallback(() => {
    try {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const saved = getScroll(scrollKey);
      if (saved > 0) win.scrollTo(0, saved);
      win.addEventListener(
        'scroll',
        (e: Loose) => {
          if (scrollKey) setScroll(scrollKey, win.scrollY || 0);
          onChromeScroll?.(e);
        },
        { passive: true },
      );
    } catch (_e) {}
  }, [onChromeScroll, scrollKey]);

  // Render HTML through a blob: URL so in-page TOC anchors scroll instead of blanking the
  // sandboxed iframe (see use-html-blob.ts). Hooks must run before the early returns below.
  const frameUrl = useHtmlBlobUrl(
    detailDoc?.html || '<!doctype html><html><body><p>暂无内容</p></body></html>',
  );

  // A space that exists but has no documents is not an access problem — show a
  // dedicated empty state rather than the "need to login / no access" screen.
  if (requestedSpace && (requestedSpace.children?.length ?? 0) === 0) {
    return (
      <div className="main-card reader-card">
        <div className="reader-locked">
          <h2 className="reader-locked-title">「{requestedSpace.name}」还没有文档</h2>
          <p className="reader-locked-desc">这个空间目前是空的。上传或新建文档后会显示在这里。</p>
          <div className="reader-locked-actions">
            <button type="button" className="reader-locked-secondary" onClick={browsePublic}>
              浏览其他文档
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (denied || detailDenied || !space || !doc) {
    const earlyDocId = detailDoc?.id || doc?.id || ctx.docId;
    return (
      <div className="main-card reader-card">
        <div className={`reader-meta-bar corner ${chromeVisible ? '' : 'meta-bar-hidden'}`}>
          {doc && (
            <>
              <span className={`dot ${dotClass(doc.dot || 'slate')}`}></span>
              <span className="doc-title">{doc.title}</span>
            </>
          )}
          <div style={{ flex: 1 }} />
          {allowed && (
            <button type="button" className="pill-btn ghost" onClick={copyReaderLink}>
              {copied ? <_I.check /> : <_I.link />}
              <span>{copied ? '已复制' : '链接'}</span>
            </button>
          )}
          {allowed && earlyDocId && (
            <button type="button" className="pill-btn ghost" onClick={() => onShare(earlyDocId)}>
              <_I.share />
              <span>分享</span>
            </button>
          )}
        </div>
        <div className="reader-locked">
          <div className="reader-locked-glyph">
            <_I.lockLarge />
          </div>
          <h2 className="reader-locked-title">
            {user ? '没有权限查看这篇文档' : '这篇文档需要登录'}
          </h2>
          <p className="reader-locked-desc">
            {user
              ? '当前账号没有这个空间或文档的阅读权限。请联系管理员添加空间权限，或让文档所有者单独分享给你。'
              : '请先登录团队账号，登录后会回到刚才的页面。'}
          </p>
          <div className="reader-locked-actions">
            {user ? (
              <button type="button" className="reader-locked-secondary" onClick={browsePublic}>
                浏览可阅读文档
              </button>
            ) : (
              <>
                <button type="button" className="reader-locked-primary" onClick={onLogin}>
                  <_I.signIn />
                  登录账号
                </button>
                <button type="button" className="reader-locked-secondary" onClick={browsePublic}>
                  浏览公开文档
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-card reader-card">
      <div className={`reader-meta-bar corner ${chromeVisible ? '' : 'meta-bar-hidden'}`}>
        <span className={`dot ${dotClass(doc.dot || 'slate')}`}></span>
        <span className="doc-title">{doc.title}</span>
        {allowed ? (
          <>
            <span className="sep">·</span>
            <span className="author">{author?.name}</span>
            <span className="sep">·</span>
            <span className="mono dim" style={{ fontSize: 11 }}>
              {doc.updated}
            </span>
          </>
        ) : null}
        <div style={{ flex: 1 }} />
        {doc ? (
          <>
            {allowed && (
              <button type="button" className="pill-btn ghost" onClick={copyReaderLink}>
                {copied ? <_I.check /> : <_I.link />}
                <span>{copied ? '已复制' : '链接'}</span>
              </button>
            )}
            {allowed && (
              <button type="button" className="pill-btn ghost" onClick={() => onShare(doc.id)}>
                <_I.share />
                <span>分享</span>
              </button>
            )}
            {allowed && isMarkdown && (
              <>
                <button type="button" className="pill-btn ghost" onClick={() => doCopy('rich')}>
                  {copiedMode === 'rich' ? <_I.check /> : <_I.copy />}
                  <span>{copiedMode === 'rich' ? '已复制' : '带格式'}</span>
                </button>
                <button type="button" className="pill-btn ghost" onClick={() => doCopy('source')}>
                  {copiedMode === 'source' ? <_I.check /> : <_I.code />}
                  <span>{copiedMode === 'source' ? '已复制' : '复制源码'}</span>
                </button>
                {detailDoc?.canEdit && (
                  <button
                    type="button"
                    className="pill-btn accent"
                    onClick={() => setEditing(true)}
                  >
                    <_I.edit />
                    <span>编辑</span>
                  </button>
                )}
              </>
            )}
          </>
        ) : null}
        {!allowed ? (
          <span
            className={`vis-chip reader-lock-chip ${doc.access === 'restricted' ? 'private' : 'locked'}`}
          >
            {doc.access === 'restricted' ? '需登录 · 受限' : '需登录'}
          </span>
        ) : null}
      </div>

      <div className={`reader-iframe-wrap ${framedDoc ? 'framed' : ''}`} onScroll={onChromeScroll}>
        {allowed ? (
          detailQuery.isLoading ? (
            <div className="reader-skeleton" role="status" aria-label="正在加载正文">
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
          ) : isMarkdown ? (
            <MarkdownReader
              content={detailDoc.html || ''}
              onScroll={onChromeScroll}
              tocPanel
              scrollKey={scrollKey}
            />
          ) : (
            <iframe
              ref={iframeRef}
              className="reader-iframe"
              src={frameUrl}
              title={detailDoc.title}
              sandbox="allow-scripts allow-forms allow-popups"
              onLoad={bindIframeScroll}
            />
          )
        ) : (
          <div className="reader-locked">
            <div className="reader-locked-glyph">
              <_I.lockLarge />
            </div>
            <h2 className="reader-locked-title">
              {user ? '没有权限查看这篇文档' : '这篇文档需要登录'}
            </h2>
            <p className="reader-locked-desc">
              {user
                ? '当前账号没有「' +
                  space.name +
                  '」空间中这篇文档的阅读权限。请联系管理员添加空间权限，或让文档所有者单独分享给你。'
                : doc.access === 'restricted'
                  ? '这是一篇受限文档，仅作者、管理员或被显式授权的成员可读。请先登录团队账号查看。'
                  : '请先登录团队账号，登录后系统会按你的空间和文档权限判断是否可读。'}
            </p>
            <div className="reader-locked-actions">
              {!user && (
                <button type="button" className="reader-locked-primary" onClick={onLogin}>
                  <_I.signIn />
                  登录账号
                </button>
              )}
              <button type="button" className="reader-locked-secondary" onClick={browsePublic}>
                {user ? '浏览可阅读文档' : '浏览公开文档'}
              </button>
            </div>
          </div>
        )}
      </div>
      {editing && detailDoc && (
        <MarkdownEditorDialog
          doc={detailDoc}
          spaces={spaces}
          onClose={() => setEditing(false)}
          onSave={(content: Loose, patch: Loose) => {
            const { spaceName: _sn, spaceAccent: _sa, ...rest } = patch || {};
            mutations?.updateDocument?.(detailDoc.id, { ...rest, html: content });
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
