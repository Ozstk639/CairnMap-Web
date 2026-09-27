import { createConfigPackageFromCurrentProject } from '../../src/configStudio/legacyProjectAdapter';
import { validateConfigPackage } from '../../src/configStudio/runtime';

const config = createConfigPackageFromCurrentProject();
const report = validateConfigPackage(config);
if (!report.valid) {
  throw new Error(`Bundled V1-to-V3 configuration is invalid:\n${report.issues.filter((item) => item.severity === 'error').map((item) => `${item.code} (${item.path}): ${item.message}`).join('\n')}`);
}

const bud = config.nodes.find((node) => node.path.class === 'BUD' && !node.path.kind);
const structureRule = bud?.geometryProfiles.Polygon?.zoomPriority.rules.find((item) => item.id === 'structure-low-point');
if (structureRule?.priority?.metric?.divisor !== 10 || structureRule.priority.metric.max !== 999) throw new Error('BUD V1 area-priority formula was not imported as floor(area / 10), capped at 999.');
if (bud?.containment?.role !== 'parent') throw new Error('BUD containment binding was not imported.');

const flr = config.nodes.find((node) => node.path.class === 'FLR' && !node.path.kind);
if (flr?.containment?.role !== 'child' || flr.containment.parentReferenceField !== 'BuildingID') throw new Error('FLR containment binding was not imported.');

if (!config.workflows.every((workflow) => workflow.steps.at(-1)?.kind === 'geometry')) throw new Error('A migrated workflow does not end with its geometry page.');
if (!config.workflows.every((workflow) => workflow.steps.some((step) => step.kind === 'form'))) throw new Error('A migrated workflow has no editable basic information page.');

console.log(`config-studio-v3: ${config.nodes.length} category nodes, ${config.workflows.length} workflows, ${config.parity?.entries.length ?? 0} parity entries: OK`);
