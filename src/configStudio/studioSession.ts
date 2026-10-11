export type StudioTab = 'features' | 'workflows';
import type { ConfigPackageV3 } from './types';
export type ClassTreeSession={classCode:string;baseline:ConfigPackageV3;staged:ConfigPackageV3;changes:string[]};
export type StudioEditingSession={draft:ConfigPackageV3|null;tree:ClassTreeSession|null;selectedId:string;editing:boolean;baseline:ConfigPackageV3};

/** An active edit must be explicitly saved or discarded before leaving it. */
export function canSwitchStudioTab(current: StudioTab, next: StudioTab, drafts: { feature: boolean; workflow: boolean }): boolean {
  return current === next || (!drafts.feature && !drafts.workflow);
}

export function workflowStudioUrl(href: string): string {
  const target = new URL(href);
  target.searchParams.set('workspace', 'config-studio');
  target.searchParams.set('tab', 'workflows');
  return target.toString();
}
