// CairnMap FINAL CLEANUP: workflow editor adapter only. Active workflow definitions live in preset workflow JSON and component executor contracts.
// CairnMap LEGACY CLEANUP: workflow component executor/compatibility only.
// New workflow registrations belong in presets/shared/workflow and workflowLegacyExecutors.json.
export type {
  ClassificationEditScope,
  ClassificationSceneUsage,
  FieldSceneUsage,
  PersistedFieldDef,
  ProjectedRegistryClassification,
  ProjectedRegistryField,
  ProjectedRegistryGroup,
  ProjectedRegistryScene,
  RegistryClassCode,
  RegistryClassificationDef,
  RegistryClassificationOption,
  RegistryClassificationRef,
  RegistryControlType,
  RegistryFormatter,
  RegistryGroupDef,
  RegistryGroupItemFieldDef,
  RegistryIntegrationMode,
  RegistryLabels,
  RegistryMatch,
  RegistryScene,
  RegistrySelectOption,
  WorkflowAuxInputDef,
  WorkflowEditorSchema,
} from './types';

export {
  getByPath,
  getClassificationOptions,
  getSceneLabel,
  projectRegistryScene,
  resolveClassificationDisplayName,
  resolveRegistrySchema,
  setByPath,
} from './utils';

export { ISG_SCHEMAS, SCHEMA_ISG_ADM_DBZ, SCHEMA_ISG_ADM_PLZ, SCHEMA_ISG_NGF_LAD, SCHEMA_ISG_NGF_LIS, SCHEMA_ISG_NGF_WTB } from './schema_ISG';
export { ISL_SCHEMAS, SCHEMA_ISL_ADM_DBL, SCHEMA_ISL_ADM_PLL, SCHEMA_ISL_NGF_BOD, SCHEMA_ISL_NGF_WTR } from './schema_ISL';
export { ISP_SCHEMAS, SCHEMA_ISP_ADM_DBP, SCHEMA_ISP_ADM_PLP, SCHEMA_ISP_NGF_SCP } from './schema_ISP';
export { BUD_SCHEMAS, SCHEMA_BUD_BUILDING } from './schema_BUD';
export { FLR_SCHEMAS, SCHEMA_FLR_UNIT } from './schema_FLR';
export { ROD_SCHEMAS, SCHEMA_ROD_ROAD } from './schema_ROD';
export { TPP_SCHEMAS, SCHEMA_TPP_TELEPORT } from './schema_TPP';
export { WRP_SCHEMAS, SCHEMA_WRP_WARP } from './schema_WRP';
export { TRP_SCHEMAS, SCHEMA_TRP_TRADE } from './schema_TRP';
export {
  RAIL_SCHEMAS,
  SCHEMA_RAIL_LINE,
  SCHEMA_RAIL_PLATFORM,
  SCHEMA_RAIL_PLATFORM_BOUNDARY,
  SCHEMA_RAIL_STATION,
  SCHEMA_RAIL_STATION_BUILDING,
  SCHEMA_RAIL_STATION_BUILDING_FLOOR,
  SCHEMA_RAIL_STATION_BUILDING_POINT,
} from './schema_RAIL';

import { ISG_SCHEMAS } from './schema_ISG';
import { ISL_SCHEMAS } from './schema_ISL';
import { ISP_SCHEMAS } from './schema_ISP';
import { BUD_SCHEMAS } from './schema_BUD';
import { FLR_SCHEMAS } from './schema_FLR';
import { ROD_SCHEMAS } from './schema_ROD';
import { TPP_SCHEMAS } from './schema_TPP';
import { WRP_SCHEMAS } from './schema_WRP';
import { TRP_SCHEMAS } from './schema_TRP';
import { RAIL_SCHEMAS } from './schema_RAIL';
import type { WorkflowEditorSchema } from './types';
import { resolveRegistrySchema as resolveFromSchemaList } from './utils';

export const WORKFLOW_EDITOR_SCHEMAS: WorkflowEditorSchema[] = [
  ...ISG_SCHEMAS,
  ...ISL_SCHEMAS,
  ...ISP_SCHEMAS,
  ...BUD_SCHEMAS,
  ...FLR_SCHEMAS,
  ...ROD_SCHEMAS,
  ...TPP_SCHEMAS,
  ...WRP_SCHEMAS,
  ...TRP_SCHEMAS,
  ...RAIL_SCHEMAS,
];

export const resolveWorkflowEditorSchema = (args: Parameters<typeof resolveFromSchemaList>[1]): WorkflowEditorSchema | null => {
  return resolveFromSchemaList(WORKFLOW_EDITOR_SCHEMAS, args);
};
