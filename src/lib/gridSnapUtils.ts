/**
 * Grid snap shared utilities.
 *
 * This file intentionally has no React/UI imports. Main map and navigation code may
 * import these helpers without pulling the measuring UI chunk into the initial
 * bundle. The visual switch component lives in components/Mapping/tools.
 */
export type GridSnapMode = 'auto' | 'center' | 'edge';

export type WorldPoint = { x: number; z: number; y?: number };

type Listener = (m: GridSnapMode) => void;

let _mode: GridSnapMode = 'auto';
const _listeners = new Set<Listener>();

export const getGridSnapMode = (): GridSnapMode => _mode;

export const setGridSnapMode = (m: GridSnapMode) => {
  if (_mode === m) return;
  _mode = m;
  _listeners.forEach((fn) => fn(_mode));
};

export const subscribeGridSnapMode = (listener: Listener): (() => void) => {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
};

const fixNegZero = (n: number) => (Object.is(n, -0) ? 0 : n);

export const stepToDecimals = (step: number): number => {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(step);
  if (s.includes('e-')) {
    const exp = Number(s.split('e-')[1]);
    return Number.isFinite(exp) ? exp : 0;
  }
  const dot = s.indexOf('.');
  if (dot < 0) return 0;
  return Math.min(10, s.length - dot - 1);
};

export const roundToStepStable = (n: number, step: number): number => {
  if (!Number.isFinite(n)) return n;
  if (!Number.isFinite(step) || step <= 0) return n;
  const q = (n + Number.EPSILON) / step;
  const rq = Math.round(q);
  const v = rq * step;
  const dec = stepToDecimals(step);
  return fixNegZero(Number(v.toFixed(dec)));
};

export const snapNumberByMode = (n: number, mode: GridSnapMode): number => {
  if (!Number.isFinite(n)) return n;
  if (mode === 'auto') return fixNegZero(Math.round((n + Number.EPSILON) * 2) / 2);
  if (mode === 'edge') return fixNegZero(Math.round(n));
  return fixNegZero(Math.round(n - 0.5) + 0.5);
};

export const snapWorldPointByMode = (p: { x: number; z: number }, mode: GridSnapMode = getGridSnapMode()) => ({
  x: snapNumberByMode(p.x, mode),
  z: snapNumberByMode(p.z, mode),
});

export const formatGridNumber = (n: number) => {
  if (!Number.isFinite(n)) return String(n);
  const r = Math.round(n);
  if (Math.abs(n - r) < 1e-9) return String(r);
  return n.toFixed(1);
};

/** parse & validate: only allow integer or .5 step; return null if invalid/empty */
export const parseHalfStepNumber = (raw: string): number | null => {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const v = n * 2;
  if (Math.abs(v - Math.round(v)) > 1e-9) return null;
  return fixNegZero(Math.round(v) / 2);
};

/**
 * Manual/import/export precision step (default 0.1).
 * This is intentionally separated from grid snap (0.5) logic.
 */
export const MANUAL_COORD_STEP = 0.1;

/** parse & validate: only allow multiples of `step` (default 0.1); return null if invalid/empty */
export const parseStepNumber = (raw: string, step: number = MANUAL_COORD_STEP): number | null => {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (!Number.isFinite(step) || step <= 0) return null;
  const q = n / step;
  const rq = Math.round(q);
  if (Math.abs(q - rq) > 1e-9) return null;
  return roundToStepStable(n, step);
};
