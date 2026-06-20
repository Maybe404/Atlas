import { useMemo, useState } from 'react';
import { canRead } from '../auth';
import { I } from '../chrome';
import { docCategory, docChip } from '../labels';
import type { Loose } from '../loose-types';
import { clickableProps } from '../ui-kit';
import { accentDot, dotClass } from './shared';

const _I = I;

// ─────────────────────────────────────────────────────────────────────────
// SPACE INDEX · card grid
// ─────────────────────────────────────────────────────────────────────────
export function SpaceIndexView({ ctx, spaces = [], members = [], user, onNavigate }: Loose) {
  const space = spaces.find((s: Loose) => s.id === ctx.spaceId) || spaces[0];
  const [filter, setFilter] = useState('all');
  const canEditSpace = space?.role === 'editor' || user?.role === 'admin';

  const docs = useMemo(() => {
    let r = [...(space?.children || [])];
    if (filter !== 'all') r = r.filter((d: Loose) => docCategory(d) === filter);
    return r;
  }, [space, filter]);

  const desc = space?.description || `${space?.name || '空间'} 的文档集合。`;

  if (!space) {
    return (
      <div className="main-card">
        <div className="app-state-banner">暂无空间</div>
      </div>
    );
  }

  return (
    <div className="main-card">
      <div className="main-scroll">
        <div className="page-head">
          <div className="left">
            <div className="eyebrow">
              <span
                className={`dot ${accentDot(space.accent)}`}
                style={{ width: 7, height: 7, borderRadius: '50%' }}
              ></span>
              空间 · {space.name}
            </div>
            <h1>{space.name}</h1>
            <p className="lead">{desc}</p>
          </div>
          <div className="right">
            <span className="mono dim" style={{ fontSize: 12 }}>
              {docs.length} 篇 · {members.length} 人
            </span>
          </div>
        </div>

        <div className="toolbar">
          <div className="segmented">
            {[
              { v: 'all', l: '全部' },
              { v: 'published', l: '公开' },
              { v: 'restricted', l: '受限' },
              { v: 'inherit', l: '继承' },
            ].map((t: Loose) => (
              <button
                type="button"
                key={t.v}
                className={filter === t.v ? 'active' : ''}
                onClick={() => setFilter(t.v)}
              >
                {t.l}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }}></span>
          {canEditSpace && (
            <>
              <button
                type="button"
                className="btn secondary"
                onClick={() => onNavigate({ view: 'admin-upload', spaceId: space.id })}
              >
                <_I.upload width="13" height="13" />
                <span>导入</span>
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => onNavigate({ view: 'admin-docs', spaceId: space.id })}
              >
                <_I.plus />
                <span>新建文档</span>
              </button>
            </>
          )}
        </div>

        <div className="doc-grid">
          {docs.map((doc: Loose) => {
            const locked = !canRead(doc, user);
            const author =
              !locked && doc.author ? members.find((m: Loose) => m.id === doc.author) : null;
            return (
              <div
                key={doc.id}
                className="doc-card"
                {...clickableProps(
                  () => onNavigate({ view: 'reader', spaceId: space.id, docId: doc.id }),
                  { label: doc.title },
                )}
              >
                <div className="card-head">
                  <div className={`dot ${dotClass(doc.dot || 'slate')}`}></div>
                  <span className={`vis-chip ${locked ? 'locked' : docChip(doc).cls}`}>
                    {locked ? '需登录' : docChip(doc).label}
                  </span>
                </div>
                <h3>{doc.title}</h3>
                <p className="desc">{locked ? '登录后查看摘要和正文。' : doc.desc}</p>
                {!locked && (
                  <div className="card-foot">
                    <span className="avatar small">{author?.initials}</span>
                    <span>{author?.name}</span>
                    <span className="updated">{doc.updated}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
