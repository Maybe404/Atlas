import type { Loose } from '../loose-types';

// dot color mapping helper
export function dotClass(d: Loose) {
  return d === 'accent'
    ? 'dot-blue'
    : d === 'moss'
      ? 'dot-green'
      : d === 'slate'
        ? 'dot-blue'
        : d === 'plum'
          ? 'dot-purple'
          : d === 'ink'
            ? 'dot-gray'
            : 'dot-blue';
}

export function accentDot(a: Loose) {
  return a === 'moss'
    ? 'dot-green'
    : a === 'plum'
      ? 'dot-purple'
      : a === 'accent'
        ? 'dot-orange'
        : a === 'ink'
          ? 'dot-gray'
          : 'dot-blue';
}
