import type { CairnMapWorkflowConfig, CairnMapWorkflowPage } from './workflowTypes';

const normalize = (value: unknown): string => String(value ?? '').trim();

export type CairnMapWorkflowPageRuntimeSummary = {
  workflowId: string;
  pageIds: string[];
  drawingEnabledPageIds: string[];
  firstDrawingPageId: string | null;
  editablePageIds: string[];
};

export function getWorkflowPageRuntimeSummary(workflow: CairnMapWorkflowConfig): CairnMapWorkflowPageRuntimeSummary {
  const pages = workflow.pages ?? [];
  const pageIds = pages.map((page) => normalize(page.id)).filter(Boolean);
  const drawingEnabledPageIds = pages
    .filter((page) => page.drawing?.enabledFromThisPage)
    .map((page) => normalize(page.id))
    .filter(Boolean);
  const editablePageIds = workflow.editSupport?.editablePageIds?.length
    ? workflow.editSupport.editablePageIds.map(normalize).filter(Boolean)
    : pageIds;
  return {
    workflowId: workflow.id,
    pageIds,
    drawingEnabledPageIds,
    firstDrawingPageId: drawingEnabledPageIds[0] ?? null,
    editablePageIds,
  };
}

export function getWorkflowPageById(workflow: CairnMapWorkflowConfig, pageId: string): CairnMapWorkflowPage | null {
  const id = normalize(pageId);
  return (workflow.pages ?? []).find((page) => normalize(page.id) === id) ?? null;
}

export function canWorkflowPageGoBack(page: CairnMapWorkflowPage): boolean {
  return page.drawing?.allowBack !== false;
}

export function shouldWorkflowKeepDrawingWhenBack(page: CairnMapWorkflowPage): boolean {
  return page.drawing?.keepDrawingWhenBack === true;
}
