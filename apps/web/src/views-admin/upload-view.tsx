import { extractHtmlMetadata, extractMarkdownMetadata } from '@atlas/shared';
import { useCallback, useEffect, useState } from 'react';
import { I } from '../chrome';
import { visibilityLabel } from '../labels';
import type { Loose } from '../loose-types';
import { MarkdownReader } from '../views/markdown-reader';

const _I2 = I;

export function AdminUploadView({
  ctx: _ctx,
  spaces = [],
  onNavigate,
  pushToast: _pushToast,
  mutations,
}: Loose) {
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<Loose[]>([]);
  const [selectedFile, setSelectedFile] = useState<Loose>(null);
  const [selectedHtml, setSelectedHtml] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('html');
  const [over, setOver] = useState(false);
  // Uploads require space-editor access; only offer spaces the user can actually write to.
  const editableSpaces = spaces.filter((s: Loose) => s.role === 'editor');
  const [meta, setMeta] = useState({
    title: '',
    spaceId: editableSpaces[0]?.id || '',
    visibility: 'invite',
    desc: '',
  });

  useEffect(() => {
    const editable = spaces.filter((s: Loose) => s.role === 'editor');
    if (!editable.length) return;
    setMeta((m: Loose) => ({
      ...m,
      spaceId: editable.some((s: Loose) => s.id === m.spaceId) ? m.spaceId : editable[0].id,
    }));
  }, [spaces]);

  const acceptFiles = useCallback((incoming: Loose) => {
    const file =
      Array.from(incoming || []).find((f: Loose) => /\.(html?|md|markdown)$/i.test(f.name)) ||
      incoming?.[0];
    if (!file) return;
    const isMd = /\.(md|markdown)$/i.test(file.name);
    setSelectedFile(file);
    setSelectedFormat(isMd ? 'markdown' : 'html');
    file.text().then((text: Loose) => {
      const meta = isMd
        ? extractMarkdownMetadata(text, { fallbackTitle: file.name })
        : extractHtmlMetadata(text, { fallbackTitle: file.name });
      setSelectedHtml(text);
      setMeta((m: Loose) => ({
        ...m,
        title: meta.title || file.name.replace(/\.(md|markdown|html?)$/i, ''),
        desc: meta.summary || '',
      }));
    });
    const ns = [
      { name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} KB`, progress: 0 },
    ];
    setFiles(ns);
    ns.forEach((_f: Loose, i: Loose) => {
      let p = 0;
      const tick = () => {
        p += 14 + Math.random() * 18;
        setFiles((fs: Loose) =>
          fs.map((x: Loose, ix: Loose) => (ix === i ? { ...x, progress: Math.min(100, p) } : x)),
        );
        if (p < 100) setTimeout(tick, 100 + i * 40 + Math.random() * 80);
      };
      setTimeout(tick, 100 + i * 60);
    });
  }, []);
  const allDone = files.length > 0 && files.every((f: Loose) => f.progress >= 100);

  return (
    <div className="main-card">
      <div className="main-scroll">
        <div className="upload-wrap">
          <div className="upload-head">
            <div
              style={{
                fontSize: 13,
                color: 'var(--blue)',
                fontWeight: 500,
                marginBottom: 8,
                letterSpacing: '-0.012em',
              }}
            >
              团队后台 · 上传
            </div>
            <h1>上传文档（HTML / Markdown）</h1>
            <p className="sub">
              Atlas
              不编辑原始内容——它只负责隔离展示外部生成的文档。上传后会保存原始文件，并自动识别标题与摘要。
            </p>

            <div className="steps">
              {['选择文件', '填写信息', '审阅与发布'].map((s: Loose, i: Loose) => (
                <div key={s} className={`step ${step === i ? 'active' : step > i ? 'done' : ''}`}>
                  <span className="num">{step > i ? <_I2.check /> : String(i + 1)}</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="upload-card">
            {step === 0 && (
              <>
                <div
                  className={`dropzone ${over ? 'over' : ''}`}
                  onDragOver={(e: Loose) => {
                    e.preventDefault();
                    setOver(true);
                  }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e: Loose) => {
                    e.preventDefault();
                    setOver(false);
                    acceptFiles(e.dataTransfer.files);
                  }}
                >
                  <input
                    type="file"
                    accept=".html,.htm,.md,.markdown,text/html,text/markdown"
                    style={{ display: 'none' }}
                    id="atlas-upload-file"
                    onChange={(e: Loose) => acceptFiles(e.target.files)}
                  />
                  <div className="big">把 HTML / Markdown 拖到这里</div>
                  <div className="small">支持 .html 或 .md 文件</div>
                  <div className="meta">最多 8 MB · sandbox 隔离展示</div>
                  <label
                    className="btn secondary"
                    htmlFor="atlas-upload-file"
                    style={{ marginTop: 14 }}
                  >
                    选择文件
                  </label>
                </div>

                {files.length > 0 && (
                  <div style={{ marginTop: 22 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--ink-3)',
                        marginBottom: 10,
                        fontWeight: 500,
                      }}
                    >
                      已选文件 · {files.length}
                    </div>
                    {files.map((f: Loose) => (
                      <div key={f.name} className="file-line">
                        <div className="icon-tile">
                          <_I2.doc />
                        </div>
                        <span className="name">{f.name}</span>
                        <span className="meta">{f.size}</span>
                        <div className="bar">
                          <span style={{ width: `${f.progress}%` }}></span>
                        </div>
                        <span className="meta" style={{ minWidth: 36, textAlign: 'right' }}>
                          {Math.round(f.progress)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flow-footer">
                  <button className="btn ghost" onClick={() => onNavigate({ view: 'admin-docs' })}>
                    取消
                  </button>
                  <button className="btn primary" disabled={!allDone} onClick={() => setStep(1)}>
                    <span>下一步</span>
                    <_I2.arrow />
                  </button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="field">
                  <label className="field-label">标题</label>
                  <input
                    className="input"
                    value={meta.title}
                    onChange={(e: Loose) =>
                      setMeta((m: Loose) => ({ ...m, title: e.target.value }))
                    }
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="field">
                    <label className="field-label">归属空间</label>
                    <select
                      className="input"
                      value={meta.spaceId}
                      onChange={(e: Loose) =>
                        setMeta((m: Loose) => ({ ...m, spaceId: e.target.value }))
                      }
                    >
                      {editableSpaces.map((s: Loose) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">可见性</label>
                    <select
                      className="input"
                      value={meta.visibility}
                      onChange={(e: Loose) =>
                        setMeta((m: Loose) => ({ ...m, visibility: e.target.value }))
                      }
                    >
                      <option value="private">私密</option>
                      <option value="invite">受邀</option>
                      <option value="public">公开</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">摘要 · 在索引页显示</label>
                  <textarea
                    className="input textarea"
                    value={meta.desc}
                    onChange={(e: Loose) => setMeta((m: Loose) => ({ ...m, desc: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label className="field-label">展示方式</label>
                  <div
                    className="input"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12.5,
                    }}
                  >
                    <span
                      className="dot dot-green"
                      style={{ width: 7, height: 7, borderRadius: '50%' }}
                    ></span>
                    <span>iframe sandbox</span>
                    <span
                      className="dim"
                      style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--font)' }}
                    >
                      原始 HTML
                    </span>
                  </div>
                </div>
                <div className="flow-footer">
                  <button className="btn ghost" onClick={() => setStep(0)}>
                    上一步
                  </button>
                  <button
                    className="btn primary"
                    disabled={!meta.title.trim()}
                    onClick={() => setStep(2)}
                  >
                    <span>预览与发布</span>
                    <_I2.arrow />
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div
                  style={{
                    borderRadius: 'var(--r-md)',
                    overflow: 'hidden',
                    border: '1px solid var(--hairline-2)',
                  }}
                >
                  <div
                    style={{
                      padding: '14px 18px',
                      borderBottom: '1px solid var(--hairline-2)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--pearl)',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.012em' }}>
                      发布信息
                    </span>
                    <span className="mono dim" style={{ fontSize: 11 }}>
                      sandbox iframe · 原文保存
                    </span>
                  </div>
                  <div style={{ padding: '28px 24px', background: 'var(--canvas)' }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 24,
                        fontWeight: 600,
                        letterSpacing: '-0.022em',
                        marginBottom: 8,
                      }}
                    >
                      {meta.title}
                    </div>
                    <div
                      style={{
                        color: 'var(--ink-3)',
                        fontSize: 14,
                        marginBottom: 18,
                        letterSpacing: '-0.012em',
                      }}
                    >
                      {meta.desc}
                    </div>
                    {selectedFormat === 'markdown' ? (
                      <div
                        className="upload-html-preview"
                        style={{ overflow: 'auto', background: 'var(--canvas)' }}
                      >
                        <MarkdownReader content={selectedHtml} />
                      </div>
                    ) : (
                      <iframe
                        className="upload-html-preview"
                        srcDoc={selectedHtml || '<!doctype html><html><body></body></html>'}
                        title="HTML 预览"
                        sandbox="allow-scripts allow-forms allow-popups"
                      />
                    )}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      background: 'var(--pearl)',
                      borderRadius: 'var(--r-md)',
                      padding: '14px 16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-4)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: 4,
                        fontWeight: 500,
                      }}
                    >
                      HTML 存储
                    </div>
                    <div style={{ fontSize: 13.5 }}>保留原始内容</div>
                    <div style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>
                      阅读页由 iframe sandbox 隔离
                    </div>
                  </div>
                  <div
                    style={{
                      background: 'var(--pearl)',
                      borderRadius: 'var(--r-md)',
                      padding: '14px 16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-4)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: 4,
                        fontWeight: 500,
                      }}
                    >
                      分享设置
                    </div>
                    <div style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`vis-chip ${meta.visibility}`}>
                        {visibilityLabel(meta.visibility)}
                      </span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        {spaces.find((s: Loose) => s.id === meta.spaceId)?.name}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flow-footer">
                  <button className="btn ghost" onClick={() => setStep(1)}>
                    上一步
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn secondary">存为草稿</button>
                    <button
                      className="btn primary"
                      disabled={!selectedFile || !meta.title.trim()}
                      onClick={() => {
                        const formData = new FormData();
                        formData.set('file', selectedFile);
                        formData.set('title', meta.title.trim());
                        formData.set('desc', meta.desc);
                        formData.set('spaceId', meta.spaceId);
                        formData.set('visibility', meta.visibility);
                        formData.set('format', selectedFormat);
                        mutations.uploadDocument(formData, {
                          onSuccess: () => {
                            setStep(3);
                            setTimeout(() => onNavigate({ view: 'admin-docs' }), 900);
                          },
                        });
                      }}
                    >
                      <_I2.check />
                      <span>发布</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div
                  style={{
                    width: 60,
                    height: 60,
                    margin: '0 auto 18px',
                    background: 'var(--blue)',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    animation: 'pop 0.4s var(--ease-spring)',
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path
                      d="m6 14 6 6L22 8"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: '-0.022em',
                    marginBottom: 6,
                  }}
                >
                  文档已发布
                </div>
                <div className="muted" style={{ fontSize: 14 }}>
                  正在跳转回文档列表…
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
