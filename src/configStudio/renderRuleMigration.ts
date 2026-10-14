import type { ConfigPackageV3, RenderFieldCondition, RenderFieldGroup, ZoomPriorityRule } from './types';
import { resolveEffectiveFields, resolveSelectableFields, validateConfigPackage } from './runtime';
import { applyRenderOverride, isClassificationConditionField, provenFieldContradiction, renderRuleRange } from './renderRuleConditions';

export type RenderMigrationResult = { config?: ConfigPackageV3; issues: string[]; sources: Array<{ nodeId: string; sourceRule: string; newRules: string[] }> };
function contradictory(items: RenderFieldCondition[]): boolean {
  const sets = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.kind === 'fieldPresent' || item.kind === 'fieldCompare') continue;
    const values = new Set(item.kind === 'fieldEquals' ? [item.value] : item.values);
    const prior = sets.get(item.field);
    const current = prior ? new Set([...prior].filter(value => values.has(value))) : values;
    if (!current.size) return true; sets.set(item.field, current);
  }
  return items.some(item => item.kind === 'fieldPresent' && !item.present && sets.has(item.field) && !sets.get(item.field)!.has(''));
}
/** Failure produces diagnostics only; the caller retains the valid r6 package. */
export function migrateRenderRulesToR7(value: ConfigPackageV3): RenderMigrationResult {
  const issues: string[] = []; const sources: RenderMigrationResult['sources'] = [];
  if (value.contractRevision >= 7) return { config: structuredClone(value), issues, sources };
  if (value.contractRevision !== 6) return { issues: ['请先将旧包规范化为有效原生 r6。'], sources };
  const config = structuredClone(value);
  for (const node of config.nodes) for (const [geometry, profile] of Object.entries(node.geometryProfiles)) {
    if (!profile) continue;
    const fields = resolveEffectiveFields(value, node.path); const selectable = resolveSelectableFields(value, node.path).map(field => field.key);
    const converted: ZoomPriorityRule[] = [];
    for (const source of profile.zoomPriority.rules) {
      const branches = source.conditionalOverrides ?? [];
      if (branches.some(branch => branch.when.some(condition => !('field' in condition) || isClassificationConditionField(condition.field, fields) || !selectable.includes(condition.field) && !/^(tags|extensions)\./.test(condition.field)))) {
        issues.push(`${node.nodeId}/${geometry}/${source.id}：旧分支含分类、面积、嵌套 Zoom 或未知字段；保留 r6，需明确等价转换。`); continue;
      }
      const { minZoom: _min, maxZoom: _max, minExclusive: _mi, maxExclusive: _ma, conditionalOverrides: _branches, when: _when, ...body } = source;
      const base: ZoomPriorityRule = { ...body, id: `${source.id}--base`, when: { zoom: renderRuleRange(source) } };
      const result: ZoomPriorityRule[] = [base];
      const enumerate = (index: number, chosen: number[], positive: RenderFieldCondition[]): void => {
        if (result.length > 64 || issues.length) return;
        if (index < branches.length) {
          enumerate(index + 1, chosen, positive);
          const next = [...positive, ...branches[index].when as RenderFieldCondition[]];
          if (!contradictory(next)) enumerate(index + 1, [...chosen, index], next);
          return;
        }
        if (!chosen.length) return;
        let complete = base;
        const items: RenderFieldGroup['items'] = branches.map((branch, i) => {
          const condition: RenderFieldGroup = { op: 'all', items: structuredClone(branch.when) as RenderFieldCondition[] };
          return chosen.includes(i) ? condition : { op: 'not', items: [condition] };
        });
        if (provenFieldContradiction({ op: 'all', items })) return;
        for (const i of chosen) complete = applyRenderOverride(complete, branches[i]);
        result.push({ ...complete, id: `${source.id}--case-${chosen.map(i => i + 1).join('-')}`, when: { zoom: renderRuleRange(source), fields: { op: 'all', items } } });
      };
      enumerate(0, [], []);
      if (result.length > 64) { issues.push(`${node.nodeId}/${source.id}：组合超过 64 条，不进行有损迁移。`); continue; }
      converted.push(...result); sources.push({ nodeId: node.nodeId, sourceRule: source.id, newRules: result.map(rule => rule.id) });
    }
    profile.zoomPriority.rules = converted;
  }
  if (issues.length) return { issues, sources };
  config.contractRevision = 7;
  const report = validateConfigPackage(config);
  if (!report.valid) return { issues: report.issues.filter(issue => issue.severity === 'error').map(issue => `${issue.path}：${issue.message}`), sources };
  return { config, issues, sources };
}
