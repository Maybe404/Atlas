// Remembers the reader's last-opened document and per-document scroll position
// so leaving the reader (dock / admin pages) and coming back restores both,
// instead of snapping to the hardcoded first article at the top.

import type { RouteState } from './loose-types';

const LAST_KEY = 'atlas:last-reader'; // survives reloads → localStorage
const SCROLL_KEY = 'atlas:reader-scroll'; // per-tab reading position → sessionStorage

type LastReader = { spaceId: string; docId: string };

export function getLastReader(): LastReader | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v?.spaceId && v?.docId ? v : null;
  } catch {
    return null;
  }
}

export function setLastReader(spaceId?: string, docId?: string) {
  if (!spaceId || !docId) return;
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ spaceId, docId }));
  } catch {}
}

// The reader target the dock / "返回阅读" links should resolve to: the last doc
// the user actually read, falling back to the given default when there is none.
export function readerTarget(fallback: RouteState): RouteState {
  const last = getLastReader();
  return last ? { view: 'reader', spaceId: last.spaceId, docId: last.docId } : fallback;
}

function readScrollMap(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function getScroll(docId?: string): number {
  if (!docId) return 0;
  return readScrollMap()[docId] || 0;
}

export function setScroll(docId: string | undefined, top: number) {
  if (!docId) return;
  try {
    const map = readScrollMap();
    map[docId] = Math.round(top);
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(map));
  } catch {}
}
