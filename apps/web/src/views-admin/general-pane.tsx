export function GeneralPane() {
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
          工作区 · 林氏工作室
        </div>
        <h1>常规</h1>
        <p className="pane-sub">工作区基本信息。</p>
      </div>
      <div className="setting-card flat">
        <div className="card-body">
          <div className="field">
            <label className="field-label">工作区名称</label>
            <input className="input" defaultValue="林氏工作室" />
          </div>
          <div className="field">
            <label className="field-label">URL 标识符</label>
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
                className="input"
                defaultValue="lin-studio"
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
            <label className="field-label">默认语言</label>
            <select className="input">
              <option>简体中文</option>
              <option>English</option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
