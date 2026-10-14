import type { FieldDefinition, RenderFieldCondition, RenderFieldGroup, RenderRuleConditionalOverride, RenderRuleExtensions, ZoomPriorityRule } from './types';
import { compileRenderFormula, formulaContradiction, matchesAtomicCondition, matchesRenderFormula } from './renderBooleanFormula';
import { scalarValueErrors } from './renderScalar';

const classificationNames = new Set(['class', 'kind', 'skind', 'skind2', 'plinekind', 'plineskind', 'plineskind2', 'pgonkind', 'pgonskind', 'pgonskind2']);
const dangerous = new Set(['__proto__', 'prototype', 'constructor']);
export function safeConditionPath(path: string): boolean { return /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/.test(path) && !path.split('.').some(part => dangerous.has(part)); }
export function isClassificationConditionField(key: string, fields: FieldDefinition[] = []): boolean {
  const normalized = key.replace(/^(tags|Tags)\./, '').toLowerCase();
  if (classificationNames.has(normalized)) return true;
  const field = fields.find(field => field.key === key);
  return Boolean(field?.sourceRuntimeField && classificationNames.has(field.sourceRuntimeField.replace(/^(tags|Tags)\./, '').toLowerCase()));
}
export function renderRuleRange(rule: ZoomPriorityRule): { min: number; max: number } {
  return rule.when?.zoom ?? { min: rule.minZoom ?? (rule.minExclusive === undefined ? 0 : rule.minExclusive + 1), max: rule.maxZoom ?? (rule.maxExclusive === undefined ? 8 : rule.maxExclusive - 1) };
}
export function matchesRenderFields(group: RenderFieldGroup | undefined, read: (field: string) => unknown): boolean {
  if (!group) return true;
  const match = (node: RenderFieldGroup | RenderFieldCondition): boolean => {
    if ('op' in node) {
      if (node.formula) return matchesRenderFormula(node.formula, read);
      if (!node.items.length) return false;
      return node.op === 'all' ? node.items.every(match) : node.op === 'any' ? node.items.some(match) : node.items.length === 1 && !match(node.items[0]);
    }
    return matchesAtomicCondition(node, read);
  };
  return match(group);
}
export function validateRenderFields(group: RenderFieldGroup | undefined, fields: FieldDefinition[], selectable: string[]): string[] {
  if (!group) return [];
  const issues: string[] = []; let leaves = 0;
  const visit = (node: RenderFieldGroup | RenderFieldCondition, depth: number): void => {
    if (depth > 4) { issues.push('字段组合最多四层。'); return; }
    if ('op' in node) {
      if (node.formula) {
        try { compileRenderFormula(node.formula); if (formulaContradiction(node.formula)) issues.push('条件公式存在可证明的矛盾，无法命中。'); } catch (error) { issues.push(String(error instanceof Error ? error.message : error)); }
        if(node.items.length) issues.push('公式与旧组合不能同时包含条件行。');
        node.formula.terms.forEach(term=>{if(!['AND','OR','NOT'].includes(term.relation))issues.push('条件行关系无效。');visit(term.condition,0);});return;
      }
      if (!['all', 'any', 'not'].includes(node.op) || !node.items.length || node.op === 'not' && node.items.length !== 1) issues.push('组合必须为非空 AND/OR，或只包含一项的 NOT。');
      node.items.forEach(item => visit(item, depth + 1)); return;
    }
    leaves++;
    if (!safeConditionPath(node.field) || isClassificationConditionField(node.field, fields)) issues.push(`条件字段 ${node.field} 是分类字段、别名或危险路径，不能用于规则条件。`);
    else if (!selectable.includes(node.field) && !/^(tags|extensions)\./.test(node.field)) issues.push(`当前分类不存在条件字段 ${node.field}。`);
    if (node.kind === 'fieldIn' && !node.values.length) issues.push('列表条件至少需要一个保存值。');
    if(node.kind==='fieldCompare') {
      const definition=fields.find(field=>field.key===node.field);
      if(!['eq','ne','in','notIn','present','empty','gt','ge','lt','le'].includes(node.operator))issues.push('字段比较关系无效。');
      if(!['present','empty'].includes(node.operator)) {
        if(!definition)issues.push(`标量比较需要已定义字段 ${node.field}。`);
        else { const values=['in','notIn'].includes(node.operator)?node.values:[node.value];if(!values?.length)issues.push('比较至少需要一个值。');else for(const value of values)issues.push(...scalarValueErrors(definition,value));
          if(['gt','ge','lt','le'].includes(node.operator)&&definition.type!=='number'&&!(definition.type==='enum'&&definition.optionValueType==='number'))issues.push('大小比较只能用于数值字段。'); }
      }
    }
  };
  visit(group, 0);
  if (leaves > (group.formula ? 256 : 64)) issues.push(`字段条件最多 ${group.formula ? 256 : 64} 项。`);
  if (provenFieldContradiction(group)) issues.push('字段条件存在可证明的矛盾，无法命中。');
  return issues;
}
export function provenFieldContradiction(group: RenderFieldGroup): boolean {
  if(group.formula)return false; // Formula contradictions are checked with its compiled AST above.
  type Legacy=Exclude<RenderFieldCondition,{kind:'fieldCompare'}>;
  const positive: Legacy[] = [], negative: Legacy[] = [];
  const collect = (node: RenderFieldGroup | RenderFieldCondition, negate = false): void => {
    if (!('op' in node)) { if(node.kind!=='fieldCompare')(negate ? negative : positive).push(node); return; }
    if (node.op === 'not' && node.items.length === 1) collect(node.items[0], !negate);
    else if (node.op === 'all' && !negate || node.items.length === 1) node.items.forEach(item => collect(item, negate));
  };
  collect(group);
  for (const field of new Set(positive.map(item => item.field))) {
    let values: Set<string> | undefined;
    for (const item of positive.filter(item => item.field === field && item.kind !== 'fieldPresent')) {
      const next = new Set(item.kind === 'fieldEquals' ? [item.value] : item.kind === 'fieldIn' ? item.values : []);
      values = values ? new Set([...values].filter(value => next.has(value))) : next;
    }
    if (values?.size === 0) return true;
    const present = positive.filter(item => item.field === field && item.kind === 'fieldPresent').map(item => (item as Extract<RenderFieldCondition, { kind: 'fieldPresent' }>).present);
    if (present.includes(true) && present.includes(false)) return true;
    if (values) for (const value of [...values]) {
      if (present.includes(true) && !value.length || present.includes(false) && value.length
        || negative.some(item => item.field === field && (item.kind === 'fieldEquals' ? value === item.value : item.kind === 'fieldIn' ? item.values.includes(value) : item.present ? value.length > 0 : value.length === 0))) values.delete(value);
    }
    if (values?.size === 0) return true;
  }
  return false;
}
export function canonicalRenderFields(group: RenderFieldGroup | undefined): string {
  if (!group) return 'true';
  if(group.formula)return JSON.stringify({expression:group.formula.expression.trim().toUpperCase(),terms:[...group.formula.terms].sort((a,b)=>a.id.localeCompare(b.id)).map(t=>({id:t.id,condition:t.condition})),groups:[...(group.formula.groups??[])].sort((a,b)=>a.id.localeCompare(b.id))});
  const normalize = (node: RenderFieldGroup | RenderFieldCondition): string => 'op' in node
    ? `${node.op}(${node.items.map(normalize).sort().join(',')})`
    : node.kind === 'fieldIn' ? JSON.stringify({ ...node, values: [...node.values].sort() }) : JSON.stringify(node);
  return normalize(group);
}
/** Same cumulative extension semantics as the r6 native renderer. */
export function mergeRenderExtensions(base: RenderRuleExtensions | undefined, override: RenderRuleExtensions | undefined): RenderRuleExtensions | undefined {
  if (!base) return override; if (!override) return base;
  return { ...base, ...override, screenGate: override.screenGate ?? base.screenGate, labelText: { ...base.labelText, ...override.labelText }, lineLabel: override.lineLabel ?? base.lineLabel,
    anchor: { ...base.anchor, ...override.anchor }, polygonCandidates: { ...base.polygonCandidates, ...override.polygonCandidates }, collision: { ...base.collision, ...override.collision }, stability: { ...base.stability, ...override.stability }, density: override.density ?? base.density, fallback: { ...base.fallback, ...override.fallback }, visibility: override.visibility ?? base.visibility };
}
export function applyRenderOverride(base: ZoomPriorityRule, override: RenderRuleConditionalOverride): ZoomPriorityRule {
  return { ...base, ...(override.representation !== undefined ? { representation: override.representation } : {}), ...(override.style ? { style: { ...base.style!, ...override.style } } : {}), ...(override.label ? { label: override.label } : {}), ...(override.geometryStack ? { geometryStack: override.geometryStack } : {}), ...(override.priority ? { priority: override.priority } : {}), extensions: mergeRenderExtensions(base.extensions, override.extensions), conditionalOverrides: undefined };
}
