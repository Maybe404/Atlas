import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api-client';
import { AnimatedScrollList, I } from '../chrome';
import { atlasKeys } from '../data-hooks';
import type { Loose } from '../loose-types';

const _I2 = I;

export function TrashPane({ pushToast: _pushToast, mutations }: Loose) {
  const trashQuery = useQuery({
    queryKey: atlasKeys.trash,
    queryFn: () => apiGet('/documents/trash'),
  });
  const items = trashQuery.data || [];
  return (
    <>
      <div className="pane-head">
        <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6 }}>
          维护 · 回收站
        </div>
        <h1>回收站</h1>
        <p className="pane-sub">删除后保留 30 天，可恢复至原空间。过期项目将被永久删除。</p>
      </div>

      <div className="setting-card">
        <div className="card-head">
          <div>
            <h3>已删除 · {items.length}</h3>
            <div className="sub">按删除时间倒序</div>
          </div>
          <button className="btn ghost danger" onClick={() => mutations.purgeExpiredTrash?.()}>
            清理过期项目
          </button>
        </div>
        <div className="card-body card-body-scroll">
          <AnimatedScrollList className="rows-scroll">
            {items.map((it: Loose) => (
              <div key={it.id} className="trash-row">
                <div>
                  <div className="doc-name">{it.title}</div>
                  <div className="location">原位置 · {it.spaceName}</div>
                </div>
                <div className="by">作者 · {it.authorName}</div>
                <div className="when">{it.updated}</div>
                <div className="expires">
                  {it.purgeAfter
                    ? `${new Date(it.purgeAfter).toLocaleDateString('zh-CN')} 清理`
                    : '30 天内'}
                </div>
                <button
                  className="icon-btn"
                  title="恢复"
                  onClick={() => {
                    mutations.restoreDocument(it.id);
                  }}
                >
                  <_I2.refresh />
                </button>
              </div>
            ))}
          </AnimatedScrollList>
        </div>
      </div>
    </>
  );
}
