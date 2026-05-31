import { useMemo, useState } from 'react';
import { canRead } from '../auth';
import { I } from '../chrome';
import { visibilityLabel } from '../labels';
import type { Loose } from '../loose-types';
import { dotClass } from './shared';

const _I = I;

// ─────────────────────────────────────────────────────────────────────────
// SPACE INDEX · card grid
// ─────────────────────────────────────────────────────────────────────────
export function SpaceIndexView({ ctx, spaces = [], members = [], onNavigate }: Loose) {
  const space = spaces.find((s: Loose) => s.id === ctx.spaceId) || spaces[0];
  const [filter, setFilter] = useState('all');

  const docs = useMemo(() => {
    let r = [...(space?.children || [])];
    if (filter !== 'all') r = r.filter((d: Loose) => d.visibility === filter);
    return r;
  }, [space, filter]);

  const desc = (
    {
      s1: '面向工程团队的部署手册、RFC、架构笔记与事故复盘。所有公开链接保留作者署名。',
      s2: '产品决策的素材库：用户访谈、可用性测试、优先级讨论与跨团队同步。',
      s3: '视觉系统、版式实验、文案规范——一切关于「Atlas 看起来是什么样」的来源。',
      s4: '个人草稿与笔记，默认仅自己可见。',
    } as Record<string, string>
  )[space?.id];

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
                className={
                  'dot ' +
                  (space.accent === 'accent'
                    ? 'dot-orange'
                    : space.accent === 'moss'
                      ? 'dot-green'
                      : space.accent === 'plum'
                        ? 'dot-purple'
                        : 'dot-blue')
                }
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
              { v: 'public', l: '公开' },
              { v: 'invite', l: '受邀' },
              { v: 'private', l: '私密' },
            ].map((t: Loose) => (
              <button
                key={t.v}
                className={filter === t.v ? 'active' : ''}
                onClick={() => setFilter(t.v)}
              >
                {t.l}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }}></span>
          <button className="btn secondary">
            <_I.upload width="13" height="13" />
            <span>导入</span>
          </button>
          <button className="btn primary">
            <_I.plus />
            <span>新建文档</span>
          </button>
        </div>

        <div className="doc-grid">
          {docs.map((doc: Loose) => {
            const locked = !canRead(doc);
            const author =
              !locked && doc.author ? members.find((m: Loose) => m.id === doc.author) : null;
            return (
              <div
                key={doc.id}
                className="doc-card"
                onClick={() => onNavigate({ view: 'reader', spaceId: space.id, docId: doc.id })}
              >
                <div className="card-head">
                  <div className={`dot ${dotClass(doc.dot || 'slate')}`}></div>
                  <span className={`vis-chip ${locked ? 'locked' : doc.visibility}`}>
                    {locked ? '需登录' : visibilityLabel(doc.visibility)}
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
