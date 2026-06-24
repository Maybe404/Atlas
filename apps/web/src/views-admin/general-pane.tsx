import { useState } from 'react';
import { Select } from '../ui-kit';

export function GeneralPane() {
  const [lang, setLang] = useState('zh');
  return (
    <>
      <div className="pane-head">
        <div
          style={{
            fontSize: 13,
            color: 'var(--blue)',
            fontWeight: 500,
            marginBottom: 6,
            letterSpacing: '-0.012em',
          }}
        >
          工作区 · 常规
        </div>
        <h1>常规</h1>
        <p className="pane-sub">工作区基本信息。</p>
      </div>
      <div className="setting-card flat">
        <div className="card-body">
          <div className="field">
            <label className="field-label" htmlFor="ws-name">
              工作区名称
            </label>
            <input id="ws-name" className="input" defaultValue="林氏工作室" disabled />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ws-slug">
              URL 标识符
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--pearl)',
                  borderTopLeftRadius: 'var(--r-md)',
                  borderBottomLeftRadius: 'var(--r-md)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: 'var(--ink-3)',
                }}
              >
                atlas.team /
              </div>
              <input
                id="ws-slug"
                className="input"
                defaultValue="lin-studio"
                disabled
                style={{
                  flex: 1,
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <span className="field-label">默认语言</span>
            <Select
              className="input"
              ariaLabel="默认语言"
              value={lang}
              options={[
                { value: 'zh', label: '简体中文' },
                { value: 'en', label: 'English' },
              ]}
              onChange={setLang}
            />
          </div>
          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              background: 'var(--pearl)',
              borderRadius: 'var(--r-md)',
              fontSize: 12.5,
              color: 'var(--ink-3)',
              lineHeight: 1.6,
            }}
          >
            工作区名称与 URL 标识符的编辑功能即将推出，当前为只读预览。语言偏好保存在本浏览器。
          </div>
        </div>
      </div>
    </>
  );
}
