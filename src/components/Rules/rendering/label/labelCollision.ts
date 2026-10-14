import type { FeatureDisplayPlan } from '@/components/Rules/rendering/display/displayTypes';
import type { LabelDeclutterConfig, LabelRequest } from '@/components/Rules/rendering/labelLayout';
import type { LabelDensityReduceStep } from './labelDensity';

/**
 * RB_SLU collision/density bridge from DisplayPlan semantics into the existing greedy LabelLayout.
 *
 * This file is intentionally small:
 * - RB_SLU_9: it now forwards enough metadata for labelLayout.ts to run a role matrix;
 * - it makes DisplayPlan the source of label priority / required-vs-optional hide behavior;
 * - it carries role/group/hidePolicy/density metadata forward so scheduling can evolve
 *   without changing featureRenderRules.ts again.
 */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getDisplayPriority(plan: FeatureDisplayPlan): number | undefined {
  const priority = Number(plan.collision?.priority);
  return Number.isFinite(priority) ? priority : undefined;
}

function getDisplayAllowHide(plan: FeatureDisplayPlan, fallback: boolean | undefined): boolean | undefined {
  const policy = plan.collision?.hidePolicy;
  const role = plan.collision?.role;

  if (policy === 'forceShow' || role === 'required') return false;
  if (policy === 'hide' || policy === 'geometryOnly') return true;

  if (typeof plan.collision?.allowHide === 'boolean') return plan.collision.allowHide;
  return fallback;
}

function getDisplayDensityReduceOrder(plan: FeatureDisplayPlan): LabelDensityReduceStep[] | undefined {
  const reduceOrder = plan.density?.reduceOrder;
  return Array.isArray(reduceOrder) ? (reduceOrder as LabelDensityReduceStep[]) : undefined;
}

function getDisplayStabilityCacheKey(plan: FeatureDisplayPlan): string | undefined {
  const cacheKey = plan.stability?.cacheKey;
  return typeof cacheKey === 'string' ? cacheKey : undefined;
}

function getCollisionCollideWith(plan: FeatureDisplayPlan): NonNullable<LabelDeclutterConfig['collisionCollideWith']> | undefined {
  const value = plan.collision?.collideWith;
  return Array.isArray(value) ? value : undefined;
}

function getCollisionBlocks(plan: FeatureDisplayPlan): NonNullable<LabelDeclutterConfig['collisionBlocks']> | undefined {
  const value = plan.collision?.blocks;
  return Array.isArray(value) ? value : undefined;
}



export function mergeDisplayCollisionIntoDeclutter(
  declutter: LabelDeclutterConfig | undefined,
  plan: FeatureDisplayPlan,
): LabelDeclutterConfig | undefined {
  if (!declutter) return declutter;

  const priority = getDisplayPriority(plan);
  const allowHide = getDisplayAllowHide(plan, declutter.allowHide);

  return {
    ...declutter,
    priority: priority ?? declutter.priority,
    allowHide,
    groupKey: plan.collision?.group ?? declutter.groupKey,
    collisionRole: plan.collision?.role,
    collisionGroup: plan.collision?.group,
    hidePolicy: plan.collision?.hidePolicy,
    collisionAllowOverlap: plan.collision?.allowOverlap ?? declutter.collisionAllowOverlap,
    collisionCollideWith: getCollisionCollideWith(plan) ?? declutter.collisionCollideWith,
    collisionBlocks: getCollisionBlocks(plan) ?? declutter.collisionBlocks,
    minSpacingPx: isFiniteNumber(plan.collision?.paddingPx) ? plan.collision.paddingPx : declutter.minSpacingPx,

    // RB_SLU_6: pass DisplayPlan density semantics into labelLayout.
    densityEnabled: plan.density?.enabled ?? declutter.densityEnabled,
    densityGridSizePx: isFiniteNumber(plan.density?.gridSizePx) ? plan.density.gridSizePx : declutter.densityGridSizePx,
    densityMaxLabelsPerGrid: isFiniteNumber(plan.density?.maxLabelsPerGrid)
      ? plan.density.maxLabelsPerGrid
      : declutter.densityMaxLabelsPerGrid,
    densityPreserveRequired: plan.density?.preserveRequired ?? declutter.densityPreserveRequired,
    densityPreserveSelected: plan.density?.preserveSelected ?? declutter.densityPreserveSelected,
    densityGroupKey: plan.collision?.group ?? declutter.densityGroupKey,
    densityReduceOrder: getDisplayDensityReduceOrder(plan) ?? declutter.densityReduceOrder,

    // RB_SLU_7: pass DisplayPlan stability semantics into labelLayout placement cache.
    placementCacheEnabled: plan.stability?.enabled ?? declutter.placementCacheEnabled,
    placementCacheKey: getDisplayStabilityCacheKey(plan) ?? declutter.placementCacheKey,
    placementZoomBucketSize: isFiniteNumber(plan.stability?.zoomBucketSize)
      ? plan.stability.zoomBucketSize
      : declutter.placementZoomBucketSize,
    placementKeepPreviousCandidate: plan.stability?.keepPreviousCandidate ?? declutter.placementKeepPreviousCandidate,
    placementKeepPreviousAnchor: plan.stability?.keepPreviousAnchor ?? declutter.placementKeepPreviousAnchor,
    placementInvalidateWhen: plan.stability?.invalidateWhen ?? declutter.placementInvalidateWhen,

    // RB_SLU_13: network labels should stay attached to their source polyline.
    lineLabelMode: plan.anchor?.lineLabelMode ?? declutter.lineLabelMode,
  };
}

export function mergeDisplayCollisionIntoLabelRequest(
  request: LabelRequest,
  plan: FeatureDisplayPlan,
): LabelRequest {
  const declutter = mergeDisplayCollisionIntoDeclutter(request.declutter, plan) ?? request.declutter;
  return {
    ...request,
    // A component metric is already evaluated against its own geometry.
    declutter: request.partIndex === undefined ? declutter : { ...declutter, priority: request.declutter.priority },
  };
}
