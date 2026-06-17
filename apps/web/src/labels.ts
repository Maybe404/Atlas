export const ACCESS_LABELS = {
  inherit: '继承',
  restricted: '受限',
} as const;

export function accessLabel(access?: string) {
  return ACCESS_LABELS[access as keyof typeof ACCESS_LABELS] ?? '继承';
}

type DocLike = { published?: boolean; access?: string };

// Directory category, in priority order: published (reachable via a public link) overrides the
// site-internal access mode, which is either restricted or the default inherit.
export function docCategory(doc: DocLike): 'published' | 'restricted' | 'inherit' {
  if (doc.published) return 'published';
  if (doc.access === 'restricted') return 'restricted';
  return 'inherit';
}

// Chip class (reuses existing vis-chip color tokens) + label for a directory entry.
export function docChip(doc: DocLike): { cls: string; label: string } {
  switch (docCategory(doc)) {
    case 'published':
      return { cls: 'public', label: '公开' };
    case 'restricted':
      return { cls: 'private', label: '受限' };
    default:
      return { cls: 'invite', label: '继承' };
  }
}
