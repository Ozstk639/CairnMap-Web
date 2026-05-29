import type { CairnMapWorkflowConfig } from './workflowTypes';
import rail_station_workflowConfigJson from '../../../project-config/presets/rail/workflows/rail-station-workflow.json';
import rail_platform_workflowConfigJson from '../../../project-config/presets/rail/workflows/rail-platform-workflow.json';
import rail_line_workflowConfigJson from '../../../project-config/presets/rail/workflows/rail-line-workflow.json';
import rail_platform_boundary_workflowConfigJson from '../../../project-config/presets/rail/workflows/rail-platform-boundary-workflow.json';
import rail_station_building_workflowConfigJson from '../../../project-config/presets/rail/workflows/rail-station-building-workflow.json';
import rail_station_building_point_workflowConfigJson from '../../../project-config/presets/rail/workflows/rail-station-building-point-workflow.json';
import rail_station_building_floor_workflowConfigJson from '../../../project-config/presets/rail/workflows/rail-station-building-floor-workflow.json';
import road_workflowConfigJson from '../../../project-config/presets/road/workflows/road-workflow.json';
import teleport_workflowConfigJson from '../../../project-config/presets/teleport/workflows/teleport-workflow.json';
import warp_workflowConfigJson from '../../../project-config/presets/warp/workflows/warp-workflow.json';
import trade_point_workflowConfigJson from '../../../project-config/presets/trade/workflows/trade-point-workflow.json';
import generic_point_workflowConfigJson from '../../../project-config/presets/core-structures/workflows/generic-point-workflow.json';
import generic_line_workflowConfigJson from '../../../project-config/presets/core-structures/workflows/generic-line-workflow.json';
import generic_polygon_workflowConfigJson from '../../../project-config/presets/core-structures/workflows/generic-polygon-workflow.json';
import building_workflowConfigJson from '../../../project-config/presets/building/workflows/building-workflow.json';
import floor_workflowConfigJson from '../../../project-config/presets/building/workflows/floor-workflow.json';

export const OPENRIAMAP_RIA_WORKFLOW_CONFIGS: CairnMapWorkflowConfig[] = [
  rail_station_workflowConfigJson as CairnMapWorkflowConfig,
  rail_platform_workflowConfigJson as CairnMapWorkflowConfig,
  rail_line_workflowConfigJson as CairnMapWorkflowConfig,
  rail_platform_boundary_workflowConfigJson as CairnMapWorkflowConfig,
  rail_station_building_workflowConfigJson as CairnMapWorkflowConfig,
  rail_station_building_point_workflowConfigJson as CairnMapWorkflowConfig,
  rail_station_building_floor_workflowConfigJson as CairnMapWorkflowConfig,
  road_workflowConfigJson as CairnMapWorkflowConfig,
  teleport_workflowConfigJson as CairnMapWorkflowConfig,
  warp_workflowConfigJson as CairnMapWorkflowConfig,
  trade_point_workflowConfigJson as CairnMapWorkflowConfig,
  generic_point_workflowConfigJson as CairnMapWorkflowConfig,
  generic_line_workflowConfigJson as CairnMapWorkflowConfig,
  generic_polygon_workflowConfigJson as CairnMapWorkflowConfig,
  building_workflowConfigJson as CairnMapWorkflowConfig,
  floor_workflowConfigJson as CairnMapWorkflowConfig,
];

const normalize = (value: unknown): string => String(value ?? '').trim();

export function getOpenRIAMapWorkflowConfigs(): CairnMapWorkflowConfig[] {
  return OPENRIAMAP_RIA_WORKFLOW_CONFIGS;
}

export function getOpenRIAMapWorkflowConfigById(workflowId: string): CairnMapWorkflowConfig | null {
  const id = normalize(workflowId);
  if (!id) return null;
  return OPENRIAMAP_RIA_WORKFLOW_CONFIGS.find((item) => normalize(item.id) === id) ?? null;
}

export function getOpenRIAMapWorkflowConfigByClassCode(classCode: string): CairnMapWorkflowConfig | null {
  const code = normalize(classCode).toUpperCase();
  if (!code) return null;
  return OPENRIAMAP_RIA_WORKFLOW_CONFIGS.find((item) => normalize(item.targetClass).toUpperCase() === code) ?? null;
}
