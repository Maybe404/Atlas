import { AnimatedScrollList, I } from '../chrome';
import type { Loose } from '../loose-types';
import { SPACE_COLOR_LABEL, SPACE_COLOR_MAP } from './shared';

const _I2 = I;

export function SpacesPane({ spaces, perms, onEditSpace, onNewSpace, onDeleteSpace }: Loose) {
  const memberCountFor = (spaceId: Loose) => {
    return Object.values(perms).filter((p: Loose) => p?.[spaceId]).length;
  };
  return (
    <>
      <div className="pane-head">
        <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6 }}>
          工作区 · 空间
        </div>
        <h1>空间</h1>
        <p className="pane-sub">
          空间是文档的归属单元——每篇 HTML
          文章必须属于一个空间。成员对空间的访问权限可在「空间权限」中分别设置。
        </p>
      </div>

      <div className="setting-card">
        <div className="card-head">
          <div>
            <h3>所有空间 · {spaces.length}</h3>
            <div className="sub">点击行编辑名称与配色；删除空间前需先清空或移走其下文档</div>
          </div>
          <button className="btn primary" onClick={onNewSpace}>
            <_I2.plus />
            <span>新建空间</span>
          </button>
        </div>
        <div className="card-body card-body-scroll">
          <AnimatedScrollList className="rows-scroll">
            {spaces.map((sp: Loose) => {
              const color = SPACE_COLOR_MAP[sp.accent] || SPACE_COLOR_MAP.accent;
              const label = SPACE_COLOR_LABEL[sp.accent] || '珊瑚';
              return (
                <div
                  key={sp.id}
                  className="space-mgr-row"
                  onClick={() => onEditSpace(sp)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="sm-mark" style={{ background: color }}>
                    {sp.mark || sp.name.slice(0, 1)}
                  </div>
                  <div>
                    <div className="sm-name">{sp.name}</div>
                    <div className="sm-meta">
                      {label} · {sp.children?.length || 0} 篇文档 · {memberCountFor(sp.id)} 位成员
                    </div>
                  </div>
                  <div className="sm-count">{sp.count || sp.children?.length || 0}</div>
                  <div className="sm-actions" onClick={(e: Loose) => e.stopPropagation()}>
                    <button className="icon-btn" title="编辑" onClick={() => onEditSpace(sp)}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                        <path
                          d="m9 2.5 2.5 2.5L4 12.5H1.5V10z"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button className="icon-btn" title="删除" onClick={() => onDeleteSpace(sp.id)}>
                      <_I2.trash />
                    </button>
                  </div>
                </div>
              );
            })}
          </AnimatedScrollList>
        </div>
      </div>
    </>
  );
}
