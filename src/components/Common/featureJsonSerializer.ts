const EXPORT_COORD_STEP = 0.1;

const GEOMETRY_KEYS = new Set([
  'CoordP',
  'CoordL',
  'CoordG',
  'coordinate',
  'coordinates',
  'Linepoints',
  'Conpoints',
  'Flrpoints',
  'PLpoints',
  'Pointpoints',
]);

const fixNegZero = (n: number) => (Object.is(n, -0) ? 0 : n);

const stepToDecimals = (step: number): number => {
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

const roundToStep = (n: number, step: number = EXPORT_COORD_STEP) => {
  if (!Number.isFinite(n)) return n;
  if (!Number.isFinite(step) || step <= 0) return n;
  const q = (n + Number.EPSILON) / step;
  const rq = Math.round(q);
  const v = rq * step;
  const dec = stepToDecimals(step);
  return fixNegZero(Number(v.toFixed(dec)));
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const isNumericTriplet = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

export const roundXZDeep = (v: any): any => {
  if (Array.isArray(v)) {
    if (isNumericTriplet(v)) {
      return [roundToStep(v[0]), v[1], roundToStep(v[2])];
    }
    return v.map(roundXZDeep);
  }

  if (isPlainObject(v)) {
    if (typeof v.x === 'number' && typeof v.z === 'number') {
      const out: Record<string, unknown> = { ...v };
      out.x = roundToStep(v.x);
      out.z = roundToStep(v.z);
      return out;
    }

    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = roundXZDeep(val);
    return out;
  }

  return v;
};

export const normalizeFeatureJsonForExport = (value: any): any => {
  const rounded = roundXZDeep(value);

  const reorder = (input: any): any => {
    if (Array.isArray(input)) return input.map(reorder);
    if (!isPlainObject(input)) return input;

    const normalEntries: Array<[string, unknown]> = [];
    const geometryEntries: Array<[string, unknown]> = [];

    for (const [key, val] of Object.entries(input)) {
      if (val === undefined) continue;
      const normalizedVal = reorder(val);
      if (normalizedVal === undefined) continue;
      const pair: [string, unknown] = [key, normalizedVal];
      if (GEOMETRY_KEYS.has(key)) geometryEntries.push(pair);
      else normalEntries.push(pair);
    }

    return Object.fromEntries([...normalEntries, ...geometryEntries]);
  };

  return reorder(rounded);
};

const stringifyInlineValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((item) => stringifyInlineValue(item)).join(',')}]`;
  return JSON.stringify(value);
};

const stringifyPretty = (value: unknown, indentLevel: number): string => {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (isNumericTriplet(value)) return stringifyInlineValue(value);
    const indent = '  '.repeat(indentLevel);
    const childIndent = '  '.repeat(indentLevel + 1);
    const body = value.map((item) => `${childIndent}${stringifyPretty(item, indentLevel + 1)}`).join(',\n');
    return `[\n${body}\n${indent}]`;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    const indent = '  '.repeat(indentLevel);
    const childIndent = '  '.repeat(indentLevel + 1);
    const body = entries
      .map(([key, val]) => `${childIndent}${JSON.stringify(key)}: ${stringifyPretty(val, indentLevel + 1)}`)
      .join(',\n');
    return `{\n${body}\n${indent}}`;
  }

  return JSON.stringify(value);
};

export const stringifyFeatureJson = (value: any): string => stringifyPretty(normalizeFeatureJsonForExport(value), 0);

export const stringifyFeatureJsonArray = (items: any[]): string => stringifyPretty(items.map((item) => normalizeFeatureJsonForExport(item)), 0);
