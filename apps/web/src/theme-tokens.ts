import type { Loose } from './loose-types';

export const SPACE_COLOR_MAP: Record<string, string> = {
  accent: '#cc785c',
  moss: '#34c759',
  slate: '#0066cc',
  plum: '#af52de',
  ink: '#6e6e73',
  rose: '#ff2d55',
};

export const SPACE_COLOR_LABEL: Record<string, string> = {
  accent: '珊瑚',
  moss: '苔藓',
  slate: '靛蓝',
  plum: '紫梅',
  ink: '墨灰',
  rose: '玫红',
};

export const SPACE_COLORS = Object.entries(SPACE_COLOR_MAP).map(([value, color]) => ({
  value,
  v: value,
  color,
  label: SPACE_COLOR_LABEL[value] ?? value,
}));

export function spaceColor(accent: Loose) {
  return SPACE_COLOR_MAP[String(accent)] || SPACE_COLOR_MAP.accent;
}

export function spaceColorLabel(accent: Loose) {
  return SPACE_COLOR_LABEL[String(accent)] || SPACE_COLOR_LABEL.accent;
}

const DOCUMENT_DOT_CLASS: Record<string, string> = {
  accent: 'dot-blue',
  moss: 'dot-green',
  slate: 'dot-blue',
  plum: 'dot-purple',
  ink: 'dot-gray',
  rose: 'dot-pink',
};

const SPACE_ACCENT_DOT_CLASS: Record<string, string> = {
  accent: 'dot-orange',
  moss: 'dot-green',
  slate: 'dot-blue',
  plum: 'dot-purple',
  ink: 'dot-gray',
  rose: 'dot-pink',
};

const SPACE_TREE_DOT_CLASS: Record<string, string> = {
  accent: 'orange',
  moss: 'green',
  slate: '',
  plum: 'purple',
  ink: 'gray',
  rose: 'pink',
};

export function dotClass(dot: Loose) {
  return DOCUMENT_DOT_CLASS[String(dot)] ?? DOCUMENT_DOT_CLASS.accent;
}

export function accentDot(accent: Loose) {
  return SPACE_ACCENT_DOT_CLASS[String(accent)] ?? SPACE_ACCENT_DOT_CLASS.accent;
}

export function spaceTreeDotClass(accent: Loose) {
  return SPACE_TREE_DOT_CLASS[String(accent)] ?? SPACE_TREE_DOT_CLASS.accent;
}
