import type { ConfigPackageV3, ClassificationPath, GeometryKind, ZoomPriorityRule } from './types';
import { RenderRuleExtensionsEditor } from './RenderRuleExtensionsEditor';
import { DisplayPrioritySettings } from './DisplayPrioritySettings';
import { ExtraRuleSettings } from './ExtraRuleSettings';
import { RuleInteractionSettings } from './InteractionShapeSettings';
export function UnifiedRuleExtensions({ config, path, geometry, fields, rule, onChange }: { config: ConfigPackageV3; path: ClassificationPath; geometry: GeometryKind; fields: string[]; rule: ZoomPriorityRule; onChange: (rule: ZoomPriorityRule) => void }) {
  return <details className="rounded border border-indigo-200 bg-indigo-50/40 p-2" data-rule-extensions><summary className="cursor-pointer text-sm font-medium">扩展规则</summary>
    <RenderRuleExtensionsEditor embedded config={config} sourcePath={path} fields={fields} geometry={geometry} rule={rule} onChange={onChange} />
    <DisplayPrioritySettings rule={rule} onChange={onChange} fields={fields} geometry={geometry} />
    <ExtraRuleSettings rule={rule} onChange={onChange} config={config} geometry={geometry} />
    <RuleInteractionSettings rule={rule} onChange={onChange} baseline={config.engine!.interactionBaselines[geometry]} />
  </details>;
}
