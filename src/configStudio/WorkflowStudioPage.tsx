import { useEffect } from 'react';
import { ConfigStudio } from './ConfigStudio';
import { workflowStudioUrl } from './studioSession';

/** Old bookmarks enter the same package and draft coordinator as the tabs. */
export function WorkflowStudioPage({ onClose }: { onClose: () => void }) {
  useEffect(() => { window.history.replaceState(null, '', workflowStudioUrl(window.location.href)); }, []);
  return <ConfigStudio initialTab="workflows" onClose={onClose} />;
}

export default WorkflowStudioPage;
