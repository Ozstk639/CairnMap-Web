export type StudioTab = 'features' | 'workflows';

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
