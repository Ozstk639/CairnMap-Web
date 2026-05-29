// CairnMap FINAL CLEANUP: workflow component executor registry only. JSON selects componentKey; this file executes React components.
import type { ComponentType } from 'react';

import RailwayWorkflow from './RailwayWorkflow';
import StationWorkflow from './StationWorkflow';
import TeleportPointWorkflow from './TeleportPointWorkflow';
import WarpPointWorkflow from './WarpPointWorkflow';
import TradePointWorkflow from './TradePointWorkflow';
import RoadWorkflow from './RoadWorkflow';
import NaturalLandWorkflow from './NaturalLandWorkflow';
import NaturalLandSurfaceWorkflow from './NaturalLandSurfaceWorkflow';
import NaturalWaterbodyWorkflow from './NaturalWaterbodyWorkflow';
import NaturalWaterwayWorkflow from './NaturalWaterwayWorkflow';
import NaturalBoundaryWorkflow from './NaturalBoundaryWorkflow';
import SettlementBoundaryDeterminedWorkflow from './SettlementBoundaryDeterminedWorkflow';
import SettlementBoundaryPlannedWorkflow from './SettlementBoundaryPlannedWorkflow';
import SettlementBoundaryLineWorkflow from './SettlementBoundaryLineWorkflow';
import SpecialCulturalPointWorkflow from './SpecialCulturalPointWorkflow';
import BuildingWorkflow from './BuildingWorkflow';
import FloorUnitWorkflow from './FloorUnitWorkflow';
import workflowLegacyExecutorsConfigJson from '../../../../project-config/presets/core-structures/shared/workflow/workflowLegacyExecutors.json';
import type { WorkflowComponentProps, WorkflowKey, WorkflowRegistry } from './WorkflowHost';

export type WorkflowLegacyExecutorConfigItem = {
  workflowKey: WorkflowKey;
  componentKey: string;
  workflowIds?: string[];
  label?: string;
  runtimeStatus?: string;
  parityMode?: string;
};

type WorkflowLegacyExecutorsConfig = {
  items?: WorkflowLegacyExecutorConfigItem[];
};

const WORKFLOW_COMPONENT_EXECUTORS: Record<string, ComponentType<WorkflowComponentProps>> = {
  railwayWorkflow: RailwayWorkflow,
  stationWorkflow: StationWorkflow,
  teleportPointWorkflow: TeleportPointWorkflow,
  warpPointWorkflow: WarpPointWorkflow,
  tradePointWorkflow: TradePointWorkflow,
  roadWorkflow: RoadWorkflow,
  naturalLandWorkflow: NaturalLandWorkflow,
  naturalLandSurfaceWorkflow: NaturalLandSurfaceWorkflow,
  naturalWaterbodyWorkflow: NaturalWaterbodyWorkflow,
  naturalWaterwayWorkflow: NaturalWaterwayWorkflow,
  naturalBoundaryWorkflow: NaturalBoundaryWorkflow,
  settlementBoundaryDeterminedWorkflow: SettlementBoundaryDeterminedWorkflow,
  settlementBoundaryPlannedWorkflow: SettlementBoundaryPlannedWorkflow,
  settlementBoundaryLineWorkflow: SettlementBoundaryLineWorkflow,
  specialCulturalPointWorkflow: SpecialCulturalPointWorkflow,
  buildingWorkflow: BuildingWorkflow,
  floorUnitWorkflow: FloorUnitWorkflow,
};

const config = workflowLegacyExecutorsConfigJson as WorkflowLegacyExecutorsConfig;
const reportedWorkflowExecutorIssues = new Set<string>();

function reportOnce(level: 'warn' | 'error', key: string, message: string, detail?: Record<string, unknown>): void {
  if (reportedWorkflowExecutorIssues.has(key)) return;
  reportedWorkflowExecutorIssues.add(key);
  const prefix = '[CairnMap Workflow Runtime]';
  if (level === 'error') console.error(`${prefix} ${message}`, detail ?? {});
  else console.warn(`${prefix} ${message}`, detail ?? {});
}

function isActive(item: WorkflowLegacyExecutorConfigItem): boolean {
  return String(item.runtimeStatus ?? 'active').trim() !== 'disabled';
}

export function listWorkflowLegacyExecutors(): WorkflowLegacyExecutorConfigItem[] {
  return Array.isArray(config.items) ? config.items.filter(isActive) : [];
}

export function getWorkflowLegacyExecutor(workflowKey: WorkflowKey): WorkflowLegacyExecutorConfigItem | null {
  return listWorkflowLegacyExecutors().find((item) => item.workflowKey === workflowKey) ?? null;
}

export function getWorkflowExecutorComponent(componentKey: string): ComponentType<WorkflowComponentProps> | null {
  return WORKFLOW_COMPONENT_EXECUTORS[componentKey] ?? null;
}

export function buildConfigDrivenWorkflowRegistry(fallbackRegistry: WorkflowRegistry): WorkflowRegistry {
  const out = {} as WorkflowRegistry;

  for (const item of listWorkflowLegacyExecutors()) {
    const workflowKey = item.workflowKey;
    const componentKey = String(item.componentKey ?? '').trim();
    const component = getWorkflowExecutorComponent(componentKey);

    if (component) {
      out[workflowKey] = component;
      continue;
    }

    const fallback = fallbackRegistry[workflowKey];
    if (fallback) {
      out[workflowKey] = fallback;
      reportOnce(
        'error',
        `${workflowKey}:missing-config-component:${componentKey}`,
        `Workflow ${workflowKey} is configured to use componentKey ${componentKey}, but no executor component is registered. Falling back to the supplied legacy registry component.`,
        { workflowKey, componentKey },
      );
      continue;
    }

    reportOnce(
      'error',
      `${workflowKey}:missing-config-component-and-fallback:${componentKey}`,
      `Workflow ${workflowKey} is configured to use componentKey ${componentKey}, but no executor component or fallback registry component is available.`,
      { workflowKey, componentKey },
    );
  }

  return out;
}

export function getWorkflowExecutorLabel(workflowKey: WorkflowKey): string | null {
  const executor = getWorkflowLegacyExecutor(workflowKey);
  return executor?.label ?? null;
}
