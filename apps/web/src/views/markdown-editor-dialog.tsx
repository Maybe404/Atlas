import { extractMarkdownMetadata } from '@atlas/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { I } from '../chrome';
import { useDocument } from '../data-hooks';
import type { Loose } from '../loose-types';
import { copyMarkdownRich, copyMarkdownSource } from '../markdown/copy';
import { enhance, renderMarkdown } from '../markdown/renderer';
import { accentDot, dotClass, flattenFolders } from './shared';

const _I = I;

// ─────────────────────────────────────────────────────────────────────────
// MARKDOWN EDITOR DIALOG — live split-pane editor with copy buttons
// ─────────────────────────────────────────────────────────────────────────
export function MarkdownEditorDialog({ doc, spaces = [], onClose, onSave }: Loose) {
  const detailQuery = useDocument(doc.isNew ? null : doc.id, !doc.isNew);

  if (!doc.isNew && detailQuery.isLoading) {
    return (
      <div className="overlay editor-overlay">
        <div className="editor-dialog" onMouseDown={(e: Loose) => e.stopPropagation()}>
          <div className="app-state-banner">正在加载文章正文…</div>
        </div>
      </div>
    );
  }

  if (!doc.isNew && (detailQuery.isError || !detailQuery.data)) {
    return (
      <div
        className="overlay editor-overlay"
        onMouseDown={(e: Loose) => {
          if (e.target.classList.contains('editor-overlay')) onClose();
        }}
      >
        <div className="editor-dialog" onMouseDown={(e: Loose) => e.stopPropagation()}>
          <div className="app-state-banner">无法加载文章正文，可能没有编辑权限或文章已被删除。</div>
          <div style={{ padding: 16 }}>
            <button className="btn secondary" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  }

  const fullDoc = doc.isNew ? doc : { ...doc, ...detailQuery.data };
  return (
    <MarkdownEditorDialogBody doc={fullDoc} spaces={spaces} onClose={onClose} onSave={onSave} />
  );
}

function MarkdownEditorDialogBody({ doc, spaces = [], onClose, onSave }: Loose) {
  const fallbackTitle = doc.title || (doc.isNew ? '未命名文章' : '');

  const [md, setMd] = useState<string>(doc.isNew ? '' : doc.html || '');
  const [title, setTitle] = useState<string>(doc.title || '');
  const [desc, setDesc] = useState<string>(doc.desc || '');
  const [titleTouched, setTitleTouched] = useState<boolean>(Boolean(doc.title));
  const [spaceId, setSpaceId] = useState<string>(doc.spaceId || (doc.isNew ? '' : 's1'));
  const [folderId, setFolderId] = useState<string>(doc.folderId || '');
  const [access, setAccess] = useState<'inherit' | 'restricted'>(
    doc.access === 'restricted' ? 'restricted' : 'inherit',
  );
  const [showSpacePicker, setShowSpacePicker] = useState<boolean>(false);
  const [showSpaceRequired, setShowSpaceRequired] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);
  const [preview, setPreview] = useState<string>('');
  const [stacked, setStacked] = useState<'split' | 'source' | 'preview'>('split');
  const [copied, setCopied] = useState<'' | 'source' | 'rich'>('');

  const taRef = useRef<Loose>(null);
  const previewRef = useRef<Loose>(null);
  const spaceWrapRef = useRef<Loose>(null);
  const saveRef = useRef<() => void>(() => {});
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── live preview debounce ──────────────────────────────────────────────
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      const html = await renderMarkdown(md);
      setPreview(html);
    }, 120);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [md]);

  // ── enhance after preview HTML updates ───────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: enhance() must re-run whenever the rendered preview HTML changes
  useEffect(() => {
    if (previewRef.current) {
      enhance(previewRef.current);
    }
  }, [preview]);

  // ── click-outside closes space picker ────────────────────────────────
  useEffect(() => {
    if (!showSpacePicker) return;
    const onDoc = (e: Loose) => {
      if (!spaceWrapRef.current?.contains(e.target)) setShowSpacePicker(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showSpacePicker]);

  // ── metadata extraction ───────────────────────────────────────────────
  const applyMetadata = useCallback(
    (nextMd: string) => {
      const metadata = extractMarkdownMetadata(nextMd, { fallbackTitle: title || fallbackTitle });
      if (metadata.title && !titleTouched) setTitle(metadata.title);
      if (metadata.summary && !desc) setDesc(metadata.summary);
    },
    [titleTouched, title, desc, fallbackTitle],
  );

  // ── synced scroll ────────────────────────────────────────────────────
  const handleSourceScroll = () => {
    const ta = taRef.current;
    const pv = previewRef.current?.parentElement; // scroll container of preview
    if (!ta || !pv) return;
    const ratio =
      ta.scrollHeight - ta.clientHeight > 0
        ? ta.scrollTop / (ta.scrollHeight - ta.clientHeight)
        : 0;
    pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
  };

  // ── save logic ───────────────────────────────────────────────────────
  const selectedSpace = spaces.find((s: Loose) => s.id === spaceId);

  const save = () => {
    if (!spaceId) {
      setShowSpaceRequired(true);
      setShowSpacePicker(true);
      return;
    }
    const patch: Loose = { format: 'markdown' };
    const metadata = extractMarkdownMetadata(md, { fallbackTitle: title || fallbackTitle });
    const finalTitle = title.trim() || metadata.title || fallbackTitle || '未命名文章';
    const finalDesc = desc.trim() || metadata.summary || doc.desc || '';
    if (finalTitle !== doc.title) patch.title = finalTitle;
    if (finalDesc !== (doc.desc || '')) patch.desc = finalDesc;
    if (spaceId !== doc.spaceId && selectedSpace) {
      patch.spaceId = selectedSpace.id;
      patch.spaceName = selectedSpace.name;
      patch.spaceAccent = selectedSpace.accent;
    }
    if ((folderId || '') !== (doc.folderId || '')) patch.folderId = folderId || null;
    if (access !== (doc.access === 'restricted' ? 'restricted' : 'inherit')) patch.access = access;
    onSave(md, patch);
  };

  saveRef.current = save;

  // ── keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: Loose) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── copy handlers ─────────────────────────────────────────────────────
  const handleCopySource = async () => {
    try {
      await copyMarkdownSource(md);
      setCopied('source');
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(''), 1400);
    } catch {
      // silently ignore
    }
  };

  const handleCopyRich = async () => {
    try {
      await copyMarkdownRich(md);
      setCopied('rich');
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(''), 1400);
    } catch {
      // silently ignore
    }
  };

  // ── md change ────────────────────────────────────────────────────────
  const handleMdChange = (e: Loose) => {
    const next = e.target.value;
    setMd(next);
    setDirty(true);
    applyMetadata(next);
  };

  const lineCount = md.split('\n').length;
  const charCount = md.length;

  return (
    <div
      className="overlay editor-overlay"
      onMouseDown={(e: Loose) => {
        if (e.target.classList.contains('editor-overlay')) onClose();
      }}
    >
      <div className="editor-dialog" onMouseDown={(e: Loose) => e.stopPropagation()}>
        {/* ── HEAD ── */}
        <div className="editor-head">
          <div className="editor-title-wrap">
            <span
              className={`dot ${dotClass(doc.dot)}`}
              style={{ width: 8, height: 8, borderRadius: '50%' }}
            ></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="editor-title-row">
                <span className="editor-title-prefix">
                  {doc.isNew ? '新建文章 ·' : '编辑文章 ·'}
                </span>
                <input
                  className="editor-title-input"
                  value={title}
                  onChange={(e: Loose) => {
                    setTitle(e.target.value);
                    setTitleTouched(true);
                    setDirty(true);
                  }}
                  placeholder="未命名文章"
                  spellCheck={false}
                />
              </div>
              <div className="editor-sub mono">
                {selectedSpace ? selectedSpace.name : '未选择空间'}/{doc.id}.md{' '}
                {dirty && <span style={{ color: 'var(--blue)' }}>· 未保存</span>}
              </div>
              <div
                ref={spaceWrapRef}
                className={`editor-space-field ${showSpaceRequired && !spaceId ? 'required-empty' : ''}`}
                style={{ marginTop: 8, position: 'relative', maxWidth: 320 }}
              >
                <span className="label">空间</span>
                <button
                  className="editor-space-trigger"
                  onClick={(e: Loose) => {
                    e.stopPropagation();
                    setShowSpacePicker((o: Loose) => !o);
                    setShowSpaceRequired(false);
                  }}
                >
                  {selectedSpace ? (
                    <>
                      <span className={`dot ${accentDot(selectedSpace.accent)}`}></span>
                      <span>{selectedSpace.name}</span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--blue)' }}>选择空间…</span>
                  )}
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 10 10"
                    fill="none"
                    style={{ marginLeft: 4, color: 'var(--ink-4)' }}
                  >
                    <path
                      d="M2 3.5 5 7 8 3.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {showSpaceRequired && !spaceId && (
                  <span style={{ fontSize: 11, color: 'var(--blue)', marginLeft: 'auto' }}>
                    请选择空间后保存
                  </span>
                )}
                {showSpacePicker && (
                  <div className="space-picker-pop" style={{ top: 'calc(100% + 4px)', left: 0 }}>
                    {spaces.map((s: Loose) => {
                      const active = s.id === spaceId;
                      return (
                        <div
                          key={s.id}
                          className={`space-picker-row ${active ? 'active' : ''}`}
                          onClick={() => {
                            setSpaceId(s.id);
                            setFolderId('');
                            setDirty(true);
                            setShowSpacePicker(false);
                            setShowSpaceRequired(false);
                          }}
                        >
                          <span className={`dot ${accentDot(s.accent)}`}></span>
                          <span>{s.name}</span>
                          {active && (
                            <span className="check">
                              <_I.check />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {selectedSpace && (
                <div
                  className="editor-space-field"
                  style={{ marginTop: 8, position: 'relative', maxWidth: 320 }}
                >
                  <span className="label">文件夹</span>
                  <select
                    className="role-select"
                    value={folderId}
                    onChange={(e: Loose) => {
                      setFolderId(e.target.value);
                      setDirty(true);
                    }}
                  >
                    <option value="">（空间根目录）</option>
                    {flattenFolders(selectedSpace.folders).map((f: Loose) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selectedSpace && (
                <div
                  className="editor-space-field"
                  style={{ marginTop: 8, position: 'relative', maxWidth: 320 }}
                >
                  <span className="label">访问</span>
                  <select
                    className="role-select"
                    value={access}
                    onChange={(e: Loose) => {
                      setAccess(e.target.value);
                      setDirty(true);
                    }}
                  >
                    <option value="inherit">继承（跟随空间 / 文件夹）</option>
                    <option value="restricted">受限（仅作者 / 管理员 / 被授权者）</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ── copy buttons (replace editor-tabs area) ── */}
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button
              className="pill-btn ghost"
              onClick={handleCopySource}
              title="复制 Markdown 源码"
            >
              {copied === 'source' ? (
                <>
                  <_I.check />
                  <span>已复制</span>
                </>
              ) : (
                <>
                  <_I.copy />
                  <span>复制源码</span>
                </>
              )}
            </button>
            <button className="pill-btn ghost" onClick={handleCopyRich} title="复制带格式内容">
              {copied === 'rich' ? (
                <>
                  <_I.check />
                  <span>已复制</span>
                </>
              ) : (
                <>
                  <_I.copy />
                  <span>带格式</span>
                </>
              )}
            </button>
          </div>

          <button className="icon-btn" onClick={onClose} title="关闭">
            <_I.close />
          </button>
        </div>

        {/* ── BODY — split pane ── */}
        <div className={`editor-body md-split md-split-${stacked}`}>
          <div className="md-split-source">
            <textarea
              ref={taRef}
              className="editor-source"
              value={md}
              onChange={handleMdChange}
              onScroll={handleSourceScroll}
              placeholder={doc.isNew ? '在此处编写 Markdown 内容…' : ''}
              spellCheck={false}
            />
          </div>
          <div className="md-split-preview md-preview">
            <div
              className="md-body"
              ref={previewRef}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized by renderMarkdown/DOMPurify
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          </div>
        </div>

        {/* ── FOOT ── */}
        <div className="editor-foot">
          <div className="editor-foot-meta mono">
            <span>{charCount.toLocaleString()} 字符</span>
            <span className="sep">·</span>
            <span>{lineCount} 行</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button
              className="btn secondary md-narrow-only"
              onClick={() => setStacked((s) => (s === 'source' ? 'preview' : 'source'))}
            >
              {stacked === 'preview' ? '编辑' : '预览'}
            </button>
            <button className="btn primary" onClick={save}>
              <_I.check />
              <span>{doc.isNew ? '创建' : '保存'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
