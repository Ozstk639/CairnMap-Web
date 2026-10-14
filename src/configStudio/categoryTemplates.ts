import type { CategoryNode, ConfigPackageV3, GeometryKind, GeometryProfile, LabelAnchor } from './types';
import { classificationPathKey, inheritanceControls, parentClassificationPath, pathDepth, resolveCategoryNodes, resolveGeometryProfile } from './runtime';
import { editableGeometryProfile, newConfigId } from './renderRuleTemplates';
export type CategoryTemplateRequest = { parentId?: string; code: string; name?: string; geometry: GeometryKind; allowMultipleParts: boolean; anchor: LabelAnchor; sourceId?: string };
const equalCapabilities = (profile: GeometryProfile, request: Pick<CategoryTemplateRequest, 'allowMultipleParts' | 'anchor'>) => profile.allowMultipleParts === request.allowMultipleParts && (!request.allowMultipleParts || (profile.anchor ?? 'featureBbox') === request.anchor);
export function compatibleCategoryTemplates(config: ConfigPackageV3, request: CategoryTemplateRequest) {
  const parent = config.nodes.find(node => node.nodeId === request.parentId);
  return config.nodes.flatMap(node => {
    const profile = resolveGeometryProfile(config, node.path, request.geometry);
    if (!profile?.enabled || !equalCapabilities(profile, request)) return [];
    const peerParent = parentClassificationPath(node.path);
    const sibling = parent ? pathDepth(node.path) === pathDepth(parent.path) + 1 && peerParent && classificationPathKey(peerParent) === classificationPathKey(parent.path) : pathDepth(node.path) === 1;
    return [{ node, profile, rank: sibling ? 0 : node.nodeId === parent?.nodeId ? 1 : 2 }];
  }).sort((a, b) => a.rank - b.rank || classificationPathKey(a.node.path).localeCompare(classificationPathKey(b.node.path)));
}
export function createCategoryFromTemplate(config: ConfigPackageV3, request: CategoryTemplateRequest): { config: ConfigPackageV3; node: CategoryNode } {
  const parent = config.nodes.find(node => node.nodeId === request.parentId);
  if (request.parentId && !parent) throw new Error('目标父级不存在。');
  const code = request.code.trim(); if (!code) throw new Error('请输入新分类代码。');
  const depth = parent ? pathDepth(parent.path) : 0;
  if (depth >= 4) throw new Error('Skind2 不能再增加下级；可选择新增一级分类。');
  if (parent && resolveCategoryNodes(config, parent.path).some(node => node.geometryType && node.geometryType !== request.geometry)) throw new Error('新分类几何与祖先约束不一致。');
  const level = (['class', 'kind', 'skind', 'skind2'] as const)[depth];
  const path = { ...(parent?.path ?? {}), [level]: code } as CategoryNode['path'];
  if (config.nodes.some(node => classificationPathKey(node.path) === classificationPathKey(path))) throw new Error('该分类路径已存在。');
  const parentProfile = parent ? resolveGeometryProfile(config, parent.path, request.geometry) : undefined;
  const template = request.sourceId ? compatibleCategoryTemplates(config, request).find(item => item.node.nodeId === request.sourceId) : undefined;
  if (request.sourceId && !template) throw new Error('模板几何、多部件或锚点与目标不兼容。');
  const inherit = !template && parent && inheritanceControls(parent).display && parentProfile?.enabled && equalCapabilities(parentProfile, request);
  const node: CategoryNode = { nodeId: newConfigId('node'), path, classificationLabels: { ...parent?.classificationLabels, [level]: { zh: request.name?.trim() || code, en: '' } }, children: [], inheritDown: { fields: true, display: true, card: true }, fields: [], geometryProfiles: {} };
  if (!inherit) {
    const defaultProfile = editableGeometryProfile(request.geometry, config.contractRevision);
    const base = template?.profile ?? (parent && inheritanceControls(parent).display ? parentProfile : undefined) ?? defaultProfile;
    const profile = structuredClone(base);
    profile.enabled = true; profile.allowMultipleParts = request.allowMultipleParts; profile.anchor = request.allowMultipleParts ? request.anchor : 'featureBbox';
    profile.interaction = structuredClone(parent && inheritanceControls(parent).display ? parentProfile?.interaction ?? defaultProfile.interaction : defaultProfile.interaction);
    profile.zoomPriority.rules = profile.zoomPriority.rules.map(rule => ({ ...rule, id: newConfigId('render') }));
    node.geometryType = request.geometry; node.geometryProfiles[request.geometry] = profile;
  }
  const next = structuredClone(config);
  if (parent) next.nodes.find(item => item.nodeId === parent.nodeId)!.children.push(node.nodeId);
  next.nodes.push(node);
  return { config: next, node };
}
