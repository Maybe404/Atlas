import { extractHtmlMetadata } from '@atlas/shared';
import { useEffect, useRef, useState } from 'react';
import { I } from '../chrome';
import { useDocument } from '../data-hooks';
import type { Loose } from '../loose-types';
import { accentDot, dotClass, flattenFolders } from './shared';

const _I = I;

// ─────────────────────────────────────────────────────────────────────────
// HTML EDITOR DIALOG — edit doc content, save
// ─────────────────────────────────────────────────────────────────────────
export function HTMLEditorDialog({ doc, spaces = [], onClose, onSave }: Loose) {
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
  return <HTMLEditorDialogBody doc={fullDoc} spaces={spaces} onClose={onClose} onSave={onSave} />;
}

function HTMLEditorDialogBody({ doc, spaces = [], onClose, onSave }: Loose) {
  const defaultHTML =
    doc.html ||
    (doc.isNew
      ? `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title></title>
<style>
  body { font-family: -apple-system, "Noto Sans SC", sans-serif; max-width: 680px; margin: 60px auto; padding: 0 24px; color: #1d1d1f; line-height: 1.65; }
  h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 8px; }
  .meta { color: #86868b; font-size: 13px; margin-bottom: 32px; }
  h2 { font-size: 18px; margin: 36px 0 10px; letter-spacing: -0.015em; }
  p { margin: 0 0 14px; }
</style>
</head>
<body>
  <h1></h1>
  <p></p>
</body>
</html>`
      : `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>${doc.title}</title>
<style>
  body { font-family: -apple-system, "Noto Sans SC", sans-serif; max-width: 680px; margin: 60px auto; padding: 0 24px; color: #1d1d1f; line-height: 1.65; }
  h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 8px; }
  .meta { color: #86868b; font-size: 13px; margin-bottom: 32px; }
  h2 { font-size: 18px; margin: 36px 0 10px; letter-spacing: -0.015em; }
  p { margin: 0 0 14px; }
</style>
</head>
<body>
  <h1>${doc.title}</h1>
  <div class="meta">${doc.spaceName} · 最后更新 ${doc.updated}</div>
  <p>${doc.desc || ''}</p>
  <h2>正文</h2>
  <p>在此处编辑 HTML 内容。保存后，Atlas 会保留原始 HTML，并替换原文件。</p>
</body>
</html>`);
  const [html, setHTML] = useState(doc.isNew ? '' : defaultHTML);
  const [title, setTitle] = useState(doc.title);
  const [desc, setDesc] = useState(doc.desc || '');
  const [titleTouched, setTitleTouched] = useState(Boolean(doc.title));
  const [descTouched, _setDescTouched] = useState(Boolean(doc.desc));
  const [spaceId, setSpaceId] = useState(doc.spaceId || (doc.isNew ? '' : 's1'));
  const [folderId, setFolderId] = useState<string>(doc.folderId || '');
  const [access, setAccess] = useState<'inherit' | 'restricted'>(
    doc.access === 'restricted' ? 'restricted' : 'inherit',
  );
  const [showSpacePicker, setShowSpacePicker] = useState(false);
  const [showSpaceRequired, setShowSpaceRequired] = useState(false);
  const [tab, setTab] = useState(doc.isNew ? 'source' : 'source'); // 'source' | 'preview'
  const [dirty, setDirty] = useState(false);
  const taRef = useRef<Loose>(null);
  const spaceWrapRef = useRef<Loose>(null);

  useEffect(() => {
    if (!showSpacePicker) return;
    const onDoc = (e: Loose) => {
      if (!spaceWrapRef.current?.contains(e.target)) setShowSpacePicker(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showSpacePicker]);

  const selectedSpace = spaces.find((s: Loose) => s.id === spaceId);

  const applyMetadata = (nextHtml: Loose) => {
    const metadata = extractHtmlMetadata(nextHtml, { fallbackTitle: title || doc.title });
    if (metadata.title && !titleTouched) setTitle(metadata.title);
    if (metadata.summary && !descTouched) setDesc(metadata.summary);
  };

  const save = () => {
    if (!spaceId) {
      setShowSpaceRequired(true);
      setShowSpacePicker(true);
      return;
    }
    const patch: Loose = {};
    const metadata = extractHtmlMetadata(html, { fallbackTitle: title || doc.title });
    const finalTitle = title.trim() || metadata.title || doc.title || '未命名文章';
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
    onSave(html, patch);
  };
  // keydown handler binds once; ref keeps it calling the latest save closure
  const saveRef = useRef(save);
  saveRef.current = save;

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

  const handlePaste = (e: Loose) => {
    setDirty(true);
    const pasted = e.clipboardData?.getData('text/html') || e.clipboardData?.getData('text/plain');
    if (pasted) {
      const replacingBlankNewDoc = doc.isNew && !html.trim() && /<(html|!doctype)\b/i.test(pasted);
      if (replacingBlankNewDoc) {
        e.preventDefault();
        setHTML(pasted);
        applyMetadata(pasted);
        return;
      }
      requestAnimationFrame(() => applyMetadata(taRef.current?.value || pasted));
    }
  };

  return (
    <div
      className="overlay editor-overlay"
      onMouseDown={(e: Loose) => {
        if (e.target.classList.contains('editor-overlay')) onClose();
      }}
    >
      <div className="editor-dialog" onMouseDown={(e: Loose) => e.stopPropagation()}>
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
                {selectedSpace ? selectedSpace.name : '未选择空间'}/{doc.id}.html{' '}
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
          <div className="editor-tabs">
            <button
              className={`editor-tab ${tab === 'source' ? 'active' : ''}`}
              onClick={() => setTab('source')}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path
                  d="m5 3-3.5 4L5 11M9 3l3.5 4L9 11"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>HTML</span>
            </button>
            <button
              className={`editor-tab ${tab === 'preview' ? 'active' : ''}`}
              onClick={() => setTab('preview')}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
                <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              <span>预览</span>
            </button>
          </div>
          <button className="icon-btn" onClick={onClose} title="关闭">
            <_I.close />
          </button>
        </div>
        <div className="editor-body">
          {tab === 'source' ? (
            <div className="editor-source-wrap">
              <div className="editor-gutter" aria-hidden="true">
                {html.split('\n').map((_: Loose, i: Loose) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: gutter rows are line numbers — index is the identity
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={taRef}
                className="editor-source"
                value={html}
                onChange={(e: Loose) => {
                  setHTML(e.target.value);
                  applyMetadata(e.target.value);
                  setDirty(true);
                }}
                onPaste={handlePaste}
                placeholder={doc.isNew ? '粘贴 HTML 内容到这里…' : ''}
                spellCheck={false}
              />
            </div>
          ) : (
            <iframe
              className="editor-preview"
              srcDoc={html}
              title="预览"
              sandbox="allow-scripts allow-forms allow-popups"
            />
          )}
        </div>
        <div className="editor-foot">
          <div className="editor-foot-meta mono">
            <span>{html.length.toLocaleString()} 字符</span>
            <span className="sep">·</span>
            <span>{html.split('\n').length} 行</span>
            <span className="sep">·</span>
            <span>{desc ? '摘要已识别' : '原文保存'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button
              className="btn secondary"
              onClick={() => setTab(tab === 'source' ? 'preview' : 'source')}
            >
              {tab === 'source' ? '预览' : '编辑'}
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
