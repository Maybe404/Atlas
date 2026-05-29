// Temporary compatibility types for incrementally typed prototype-era TSX.
// TODO 4 removes file-level ts-nocheck first; later TODOs can tighten these shapes as files split.
// biome-ignore lint/suspicious/noExplicitAny: Prototype TSX still has broad UI glue shapes.
export type Loose = any;

export type RouteState = {
  view?: string;
  spaceId?: string;
  docId?: string;
  token?: string;
};

export type Toast = {
  id?: string;
  msg: string;
  meta?: string;
};

export type PushToast = (toast: Omit<Toast, 'id'>) => void;
