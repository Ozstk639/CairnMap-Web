/** Small shared expression language. No JavaScript is parsed or executed. */
export type WorkflowExpression =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'token'; name: string }
  | { kind: 'concat'; parts: WorkflowExpression[] }
  | { kind: 'join'; args: WorkflowExpression[] }
  | { kind:'call'; name:string; args:WorkflowExpression[] };

export const WORKFLOW_FUNCTIONS = [
  {name:'join',label:'可选段拼接',signature:'join("_",A,B)',description:'以分隔符连接非空片段，保留 0 和 false。',min:2,max:4096},
  {name:'coalesce',label:'首个非空值',signature:'coalesce(A,B)',description:'取首个非空值，0 和 false 不跳过。',min:1,max:4096},
  {name:'text',label:'转为文本',signature:'text(A)',description:'以受控方式将值转换为文本。',min:1,max:1},
  {name:'number',label:'转为数字',signature:'number(A)',description:'返回有效有限数字，无效值报错。',min:1,max:1},
  {name:'trim',label:'去除两端空白',signature:'trim(A)',description:'返回去除两端空白后的文本。',min:1,max:1},
  {name:'upper',label:'转大写',signature:'upper(A)',description:'将文本转换为大写。',min:1,max:1},
  {name:'lower',label:'转小写',signature:'lower(A)',description:'将文本转换为小写。',min:1,max:1},
  {name:'abs',label:'绝对值',signature:'abs(A)',description:'返回有限数字的绝对值。',min:1,max:1},
  {name:'round',label:'四舍五入',signature:'round(A)',description:'将有限数字四舍五入为整数。',min:1,max:1},
  {name:'add',label:'数值加法',signature:'add(A,B)',description:'按数值相加；+ 仍保持原有文本拼接。',min:2,max:2},
  {name:'subtract',label:'数值减法',signature:'subtract(A,B)',description:'按数值相减。',min:2,max:2},
  {name:'multiply',label:'数值乘法',signature:'multiply(A,B)',description:'按数值相乘。',min:2,max:2},
  {name:'divide',label:'数值除法',signature:'divide(A,B)',description:'按数值相除；除以零报错。',min:2,max:2},
  {name:'point',label:'单点坐标对象',signature:'point(A)',description:'将一个点的 CoordP 数组变为 {x,y,z}；多点报错。绘制返回格式已提供直接选择。',min:1,max:1},
  {name:'x',label:'首点 X',signature:'x(A)',description:'读取坐标对象或规范几何数组的首点 x。',min:1,max:1},
  {name:'y',label:'首点 Y',signature:'y(A)',description:'读取坐标对象或规范几何数组的首点 y。',min:1,max:1},
  {name:'z',label:'首点 Z',signature:'z(A)',description:'读取坐标对象或规范几何数组的首点 z。',min:1,max:1},
] as const;
export const WORKFLOW_SYSTEM_TOKENS = ['ID', 'World', 'WorldPrefix', 'Class', 'Kind', 'Skind', 'Skind2', 'Creator'] as const;
export const PROTECTED_WORKFLOW_TARGETS = new Set(['World', 'Class', 'Kind', 'Skind', 'Skind2', 'SKind', 'SKind2', 'Type', 'Creator', 'CreateBy', 'CreateTime', 'EditBy', 'EditTime', 'CoordP', 'CoordL', 'CoordG', 'Geometry']);

export function workflowConditionMatches(condition: import('./types').WorkflowValueCondition | undefined, slots: Record<string, unknown>, system: Record<string, unknown> = {}): boolean {
  if (!condition) return true;
  if (condition.all) return condition.all.every(item=>workflowConditionMatches(item,slots,system));
  if (condition.any) return condition.any.some(item=>workflowConditionMatches(item,slots,system));
  const value = Object.prototype.hasOwnProperty.call(system, condition.token) ? system[condition.token] : slots[condition.token];
  const empty = value == null || typeof value === 'string' && !value.trim();
  if (condition.operator === 'empty') return empty;
  if (condition.operator === 'present') return !empty;
  if (condition.operator === 'in') return condition.values?.includes(value as string | number | boolean) ?? false;
  return value === condition.value;
}

export function workflowCaptureSlots(workflow: import('./types').WorkflowDefinition): string[] {
  return workflow.steps.flatMap(step => [...new Set([step.drawing?.pointSlot, step.drawing?.captureSlot, ...(step.drawing?.auxiliaryPoints ?? []).map(point => point.slot)])]).filter((slot): slot is string => Boolean(slot));
}
export function workflowDerivedPointTokens(workflow: import('./types').WorkflowDefinition): string[] {
  return workflowCaptureSlots(workflow).flatMap(slot => [slot, `${slot}_X`, `${slot}_Y`, `${slot}_Z`, `${slot}_HEIGHT`]);
}

/** Resolve final-ID dependencies by stable output identity, retaining display order. */
export function workflowOutputAssemblyOrder(workflow: { outputs: Array<{ id: string; assignments: Array<{ target: string; expression: string; when?: import('./types').WorkflowValueCondition }> }> }): number[] {
  const dependencies = workflow.outputs.map((output, index) => new Set(output.assignments.flatMap(assignment => [...workflowExpressionTokens(parseWorkflowExpression(assignment.expression)), ...(assignment.when ? [assignment.when.token] : [])].flatMap(token => {
    const match = /^ID_(\d+)$/.exec(token);
    if (!match) return [];
    const target = Number(match[1]) - 1;
    if (target < 0 || target >= workflow.outputs.length) throw new Error(`不存在输出 token ${token}。`);
    if (target === index) {
      if (assignment.target === 'ID') throw new Error(`输出 ${output.id} 的 ID 不能依赖自身最终 ID。`);
      return [];
    }
    return [target];
  }))));
  const visiting = new Set<number>(); const done = new Set<number>(); const order: number[] = [];
  const visit = (index: number) => {
    if (done.has(index)) return;
    if (visiting.has(index)) throw new Error('工作流输出 ID 依赖形成循环。');
    visiting.add(index);
    for (const dependency of dependencies[index]) visit(dependency);
    visiting.delete(index); done.add(index); order.push(index);
  };
  workflow.outputs.forEach((_, index) => visit(index));
  return order;
}
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
    const definition=WORKFLOW_FUNCTIONS.find(item=>item.name===name[0]);
    if (!definition) throw new Error(`第 ${cursor-name[0].length+1} 个字符：不支持函数 ${name[0]}。`);
    cursor += 1; const args: WorkflowExpression[] = [];
    while (true) {
      args.push(expression(depth + 1)); space();
      if (source[cursor] === ')') { cursor += 1; break; }
      if (source[cursor] !== ',') throw new Error('join 参数必须用逗号分隔并以 ) 结束。');
      cursor += 1;
    }
    if (args.length<definition.min || args.length>definition.max) throw new Error(`${name[0]} 参数数量应为 ${definition.min}–${definition.max}。`);
    return name[0]==='join'?{ kind:'join',args }:{kind:'call',name:name[0],args};
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
  return [...new Set((expression.kind === 'join' || expression.kind==='call' ? expression.args : expression.parts).flatMap(workflowExpressionTokens))];
}

export function evaluateWorkflowExpression(source: string, slots: Record<string, unknown>, system: Record<string, unknown>): unknown {
  const text = (value: unknown) => value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  const run = (expression: WorkflowExpression): unknown => {
    if (expression.kind === 'literal') return expression.value;
    if (expression.kind === 'token') return Object.prototype.hasOwnProperty.call(system, expression.name) ? system[expression.name] : Object.prototype.hasOwnProperty.call(slots, expression.name) ? slots[expression.name] : undefined;
    if (expression.kind === 'concat') return expression.parts.map((part) => text(run(part))).join('');
    if(expression.kind==='call') {
      const values=expression.args.map(run); const value=values[0];
      const numeric=(raw:unknown)=>{if(raw==null||typeof raw==='string'&&!raw.trim())throw new Error('数值参数尚未填写。');const number=Number(raw);if(!Number.isFinite(number))throw new Error('数值参数无效。');return number;};
      const finite=(value:number)=>{if(!Number.isFinite(value))throw new Error('计算结果超出有限数值范围。');return value;};
      const coordinate=(raw:unknown):{x:number;y:number;z:number}=>{
        if(raw&&typeof raw==='object'&&!Array.isArray(raw)){const point=raw as Record<string,unknown>;return {x:numeric(point.x),y:numeric(point.y),z:numeric(point.z)};}
        let point=raw;while(Array.isArray(point)&&Array.isArray(point[0]))point=point[0];
        if(!Array.isArray(point)||point.length!==3)throw new Error('参数不是有效坐标。');return {x:numeric(point[0]),y:numeric(point[1]),z:numeric(point[2])};
      };
      switch(expression.name) {
        case 'coalesce':return values.find(item=>item!=null&&!(typeof item==='string'&&!item.trim()));
        case 'text':return text(value);
        case 'number':return numeric(value);
        case 'trim':return text(value).trim();
        case 'upper':return text(value).toUpperCase();
        case 'lower':return text(value).toLowerCase();
        case 'abs':return Math.abs(numeric(value));
        case 'round':return Math.round(numeric(value));
        case 'add':return finite(numeric(value)+numeric(values[1]));
        case 'subtract':return finite(numeric(value)-numeric(values[1]));
        case 'multiply':return finite(numeric(value)*numeric(values[1]));
        case 'divide':{const divisor=numeric(values[1]);if(divisor===0)throw new Error('不能除以零。');return finite(numeric(value)/divisor);}
        case 'point':if(Array.isArray(value)&&(value.length!==1||!Array.isArray(value[0])||value[0].length!==3||value[0].some(Array.isArray)))throw new Error('单点对象转换只允许一个点。');return coordinate(value);
        case 'x':return coordinate(value).x;
        case 'y':return coordinate(value).y;
        case 'z':return coordinate(value).z;
        default:throw new Error('未知受控函数。');
      }
    }
    const [separator, ...parts] = expression.args;
    return parts.map(run).filter((value) => value != null && String(value).trim()).map(text).join(text(run(separator)));
  };
  return run(parseWorkflowExpression(source));
}

export function formatWorkflowExpression(expression: WorkflowExpression): string {
  if (expression.kind === 'literal') return JSON.stringify(expression.value);
  if (expression.kind === 'token') return expression.name;
  if (expression.kind === 'concat') return expression.parts.map(formatWorkflowExpression).join('+');
  return `${expression.kind==='call'?expression.name:'join'}(${expression.args.map(formatWorkflowExpression).join(',')})`;
}
