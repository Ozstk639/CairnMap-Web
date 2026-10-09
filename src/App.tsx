import MapContainer from './components/Map/MapContainer'
import PWAInstallPrompt from './components/PWAInstallPrompt/PWAInstallPrompt'
import FeatureModuleLoadDialog from './components/Common/FeatureModuleLoadDialog'
import FeatureModuleLoadingOverlay from './components/Common/FeatureModuleLoadingOverlay'
import ConfigStudio from './configStudio/ConfigStudio'
import ConfigLab from './configStudio/ConfigLab'
import WorkflowStudioPage from './configStudio/WorkflowStudioPage'
import { useEffect, type ReactNode } from 'react'
import { useFeatureModuleStore } from './store/featureModuleStore'

function App() {
  const hydrateFeatureModules = useFeatureModuleStore((state) => state.hydrate)

  useEffect(() => {
    hydrateFeatureModules()
  }, [hydrateFeatureModules])

  const workspace = new URLSearchParams(window.location.search).get('workspace')
  const isConfigStudio = workspace === 'config-studio'
  const isConfigLab = workspace === 'config-lab'
  const isWorkflowStudio = workspace === 'config-workflow'

  let workspaceContent: ReactNode
  if (isConfigStudio) {
    workspaceContent = <ConfigStudio onClose={() => {
      const returnTarget = sessionStorage.getItem('cairnmap-config-studio-return')
      if (returnTarget) {
        sessionStorage.removeItem('cairnmap-config-studio-return')
        window.location.assign(returnTarget)
        return
      }
      const target = new URL(window.location.href)
      target.searchParams.delete('workspace')
      window.location.assign(target.toString())
    }} />
  } else if (isConfigLab) {
    workspaceContent = <ConfigLab onClose={() => {
      const target = new URL(window.location.href)
      target.searchParams.delete('workspace')
      target.searchParams.delete('configMode')
      window.location.assign(target.toString())
    }} />
  } else if (isWorkflowStudio) {
    workspaceContent = <WorkflowStudioPage onClose={() => {
      const target = new URL(window.location.href)
      target.searchParams.delete('workspace')
      target.searchParams.delete('tab')
      window.location.assign(target.toString())
    }} />
  } else workspaceContent = <><MapContainer /><PWAInstallPrompt /></>

  return (
    <div className="app-root h-screen w-screen">
      {workspaceContent}
      <FeatureModuleLoadDialog />
      <FeatureModuleLoadingOverlay />
    </div>
  )
}

export default App
