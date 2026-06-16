export { accentDot, dotClass, spaceTreeDotClass } from '../theme-tokens';

type FolderLike = { id: string; parentId: string | null; name: string; order: number };

// Flatten a space's folders into a depth-ordered list with indented labels, suitable for a
// native <select> path picker. Indentation uses full-width spaces (selects can't nest).
export function flattenFolders(folders: FolderLike[] = []): { id: string; label: string }[] {
  const byParent = new Map<string | null, FolderLike[]>();
  for (const f of folders) {
    const key = f.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), f]);
  }
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    const kids = (byParent.get(parent) ?? []).sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    );
    for (const f of kids) {
      out.push({ id: f.id, label: `${'　'.repeat(depth)}${f.name}` });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// Resolve a folder's full path (root → leaf) as a " / "-joined label, e.g. "设计规范 / 组件库".
// Returns '' when the doc sits at the space root (no folderId) or the id is unknown.
export function folderPathLabel(folders: FolderLike[] = [], folderId?: string | null): string {
  if (!folderId) return '';
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur = byId.get(folderId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(' / ');
}
