export const ACCESS_LABELS = {
  inherit: '继承',
  restricted: '受限',
} as const;

// Global group capability switches (Phase 5). Order drives the toggle row in the groups pane.
export const CAPABILITY_LABELS = {
  createSpace: '创建空间',
  manageMembers: '管理成员',
  manageGroups: '管理权限组',
  publish: '对外发布',
} as const;

export const CAPABILITY_ORDER = [
  'createSpace',
  'manageMembers',
  'manageGroups',
  'publish',
] as const;

export function capabilityLabel(cap: string) {
  return CAPABILITY_LABELS[cap as keyof typeof CAPABILITY_LABELS] ?? cap;
}

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
