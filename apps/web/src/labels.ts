export const VISIBILITY_LABELS = {
  public: '公开',
  invite: '受邀',
  private: '私密',
} as const;

export function visibilityLabel(visibility?: string) {
  return VISIBILITY_LABELS[visibility as keyof typeof VISIBILITY_LABELS] ?? '未知';
}
