import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
  const folderQuery = useQuery({
    queryKey: atlasKeys.trashFolders,
    queryFn: () => apiGet('/folders/trash'),
  });
  const items = trashQuery.data || [];
  const folderItems = folderQuery.data || [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }));

  return (
    <>
      <div className="pane-head">
        <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6 }}>
          维护 · 回收站
        </div>
        <h1>回收站</h1>
        <p className="pane-sub">删除后保留 30 天，可恢复至原空间。过期项目将被永久删除。</p>
      </div>

      {folderItems.length > 0 && (
        <div className="setting-card">
          <div className="card-head">
            <div>
              <h3>已删除文件夹 · {folderItems.length}</h3>
              <div className="sub">点击展开查看其中的文章 · 恢复将连同文章一并还原</div>
            </div>
          </div>
          <div className="card-body">
            <div className="trash-folder-list">
              {folderItems.map((f: Loose) => (
                <div key={f.id} className="trash-folder">
                  <div className="trash-folder-row">
                    <button
                      type="button"
                      className="trash-folder-toggle"
                      onClick={() => toggle(f.id)}
                    >
                      <span className={`trash-chev ${expanded[f.id] ? 'open' : ''}`}>
                        <_I2.chev width="12" height="12" />
                      </span>
                      <_I2.folder width="15" height="15" />
                      <span className="doc-name">{f.name}</span>
                    </button>
                    <div className="trash-folder-meta">
                      原位置 · {f.spaceName}
                      {f.subfolderCount > 0 ? ` · ${f.subfolderCount} 个子文件夹` : ''} ·{' '}
                      {f.files.length} 篇
                    </div>
                    <div className="expires">
                      {f.purgeAfter
                        ? `${new Date(f.purgeAfter).toLocaleDateString('zh-CN')} 清理`
                        : '30 天内'}
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      title="恢复整个文件夹"
                      onClick={() => mutations.restoreFolder(f.id)}
                    >
                      <_I2.refresh />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="永久删除"
                      onClick={() => {
                        if (
                          confirm(
                            `永久删除文件夹「${f.name}」及其中 ${f.files.length} 篇文章？此操作不可恢复。`,
                          )
                        )
                          mutations.permanentDeleteFolder(f.id);
                      }}
                    >
                      <_I2.trash />
                    </button>
                  </div>
                  {expanded[f.id] && (
                    <div className="trash-folder-files">
                      {f.files.length === 0 && (
                        <div className="trash-folder-empty">（无文章，仅含子文件夹）</div>
                      )}
                      {f.files.map((file: Loose) => (
                        <div key={file.id} className="trash-folder-file">
                          <_I2.doc width="13" height="13" />
                          <span className="doc-name">{file.title}</span>
                          <span className="trash-folder-file-meta">
                            {file.format} · {file.updated}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="setting-card">
        <div className="card-head">
          <div>
            <h3>已删除文章 · {items.length}</h3>
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
