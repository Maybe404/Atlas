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

export function dotClass(dot: Loose) {
  return dot === 'accent'
    ? 'dot-blue'
    : dot === 'moss'
      ? 'dot-green'
      : dot === 'slate'
        ? 'dot-blue'
        : dot === 'plum'
          ? 'dot-purple'
          : dot === 'ink'
            ? 'dot-gray'
            : 'dot-blue';
}

export function accentDot(accent: Loose) {
  return accent === 'moss'
    ? 'dot-green'
    : accent === 'plum'
      ? 'dot-purple'
      : accent === 'accent'
        ? 'dot-orange'
        : accent === 'ink'
          ? 'dot-gray'
          : 'dot-blue';
}
