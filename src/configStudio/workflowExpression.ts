/** Small shared expression language. No JavaScript is parsed or executed. */
export type WorkflowExpression =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'token'; name: string }
  | { kind: 'concat'; parts: WorkflowExpression[] }
  | { kind: 'join'; args: WorkflowExpression[] };

export const WORKFLOW_SYSTEM_TOKENS = ['ID', 'World', 'WorldPrefix', 'Class', 'Kind', 'Skind', 'Skind2', 'Creator'] as const;
const unsafeSegments = new Set(['__proto__', 'prototype', 'constructor']);
export function isSafeWorkflowTarget(path: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/.test(path) && !path.split('.').some((part) => unsafeSegments.has(part));
}

export function parseWorkflowExpression(source: string): WorkflowExpression {
  if (!source.trim() || source.length > 4096) throw new Error('表达式不能为空，且不能超过 4096 字符。');
  let cursor = 0;
  const space = () => { while (/\s/.test(source[cursor] ?? '') && cursor < source.length) cursor += 1; };
  const atom = (depth: number): WorkflowExpression => {
    if (depth > 32) throw new Error('表达式嵌套过深。');
    space();
    const quote = source[cursor];
    if (quote === '"' || quote === "'") {
      cursor += 1; let value = '';
      while (cursor < source.length) {
        const char = source[cursor++];
        if (char === quote) return { kind: 'literal', value };
        if (char !== '\\') { value += char; continue; }
        const escaped = source[cursor++];
        if (escaped === 'u') {
          const hex = source.slice(cursor, cursor + 4);
          if (!/^[0-9a-f]{4}$/i.test(hex)) throw new Error('文本中的 Unicode 转义无效。');
          value += String.fromCharCode(parseInt(hex, 16)); cursor += 4;
        } else {
          const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', '"': '"', "'": "'", '/': '/' };
          if (!(escaped in escapes)) throw new Error('文本转义无效。');
          value += escapes[escaped];
        }
      }
      throw new Error('文本缺少结束引号。');
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(cursor));
    if (number) { cursor += number[0].length; const value = Number(number[0]); if (!Number.isFinite(value)) throw new Error('数值无效。'); return { kind: 'literal', value }; }
    const name = /^[A-Za-z][A-Za-z0-9_]*/.exec(source.slice(cursor));
    if (!name) throw new Error(`无法解析第 ${cursor + 1} 个字符；只允许槽位、系统字段、文本、+ 和 join。`);
    cursor += name[0].length; space();
    if (source[cursor] !== '(') {
      if (name[0] === 'true' || name[0] === 'false') return { kind: 'literal', value: name[0] === 'true' };
      if (name[0] === 'null') return { kind: 'literal', value: null };
      return { kind: 'token', name: name[0] };
    }
    if (name[0] !== 'join') throw new Error('只允许调用 join。');
    cursor += 1; const args: WorkflowExpression[] = [];
    while (true) {
      args.push(expression(depth + 1)); space();
      if (source[cursor] === ')') { cursor += 1; break; }
      if (source[cursor] !== ',') throw new Error('join 参数必须用逗号分隔并以 ) 结束。');
      cursor += 1;
    }
    if (args.length < 2) throw new Error('join 至少需要分隔符和一个片段。');
    return { kind: 'join', args };
  };
  const expression = (depth: number): WorkflowExpression => {
    const parts = [atom(depth)]; space();
    while (source[cursor] === '+') { cursor += 1; parts.push(atom(depth)); space(); }
    return parts.length === 1 ? parts[0] : { kind: 'concat', parts };
  };
  const parsed = expression(0); space();
  if (cursor !== source.length) throw new Error(`第 ${cursor + 1} 个字符起有不支持的表达式。`);
  return parsed;
}

export function workflowExpressionTokens(expression: WorkflowExpression): string[] {
  if (expression.kind === 'token') return [expression.name];
  if (expression.kind === 'literal') return [];
  return [...new Set((expression.kind === 'join' ? expression.args : expression.parts).flatMap(workflowExpressionTokens))];
}

export function evaluateWorkflowExpression(source: string, slots: Record<string, unknown>, system: Record<string, unknown>): unknown {
  const text = (value: unknown) => value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  const run = (expression: WorkflowExpression): unknown => {
    if (expression.kind === 'literal') return expression.value;
    if (expression.kind === 'token') return Object.prototype.hasOwnProperty.call(system, expression.name) ? system[expression.name] : Object.prototype.hasOwnProperty.call(slots, expression.name) ? slots[expression.name] : undefined;
    if (expression.kind === 'concat') return expression.parts.map((part) => text(run(part))).join('');
    const [separator, ...parts] = expression.args;
    return parts.map(run).filter((value) => value != null && String(value).trim()).map(text).join(text(run(separator)));
  };
  return run(parseWorkflowExpression(source));
}

export function formatWorkflowExpression(expression: WorkflowExpression): string {
  if (expression.kind === 'literal') return JSON.stringify(expression.value);
  if (expression.kind === 'token') return expression.name;
  if (expression.kind === 'concat') return expression.parts.map(formatWorkflowExpression).join('+');
  return `join(${expression.args.map(formatWorkflowExpression).join(',')})`;
}
