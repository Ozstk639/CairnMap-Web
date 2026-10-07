import MapContainer from './components/Map/MapContainer'
import PWAInstallPrompt from './components/PWAInstallPrompt/PWAInstallPrompt'
import FeatureModuleLoadDialog from './components/Common/FeatureModuleLoadDialog'
import FeatureModuleLoadingOverlay from './components/Common/FeatureModuleLoadingOverlay'
import ConfigStudio from './configStudio/ConfigStudio'
import ConfigLab from './configStudio/ConfigLab'
import WorkflowStudioPage from './configStudio/WorkflowStudioPage'
import { useEffect } from 'react'
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

  if (isConfigStudio) {
    return <ConfigStudio onClose={() => {
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
  }

  if (isConfigLab) {
    return <ConfigLab onClose={() => {
      const target = new URL(window.location.href)
      target.searchParams.delete('workspace')
      target.searchParams.delete('configMode')
      window.location.assign(target.toString())
    }} />
  }

  if (isWorkflowStudio) {
    return <WorkflowStudioPage onClose={() => {
      const target = new URL(window.location.href)
      target.searchParams.delete('workspace')
      target.searchParams.delete('tab')
      window.location.assign(target.toString())
    }} />
  }

  return (
    <div className="app-root h-screen w-screen">
      <MapContainer />
      <PWAInstallPrompt />
      <FeatureModuleLoadDialog />
      <FeatureModuleLoadingOverlay />
    </div>
  )
}

export default App
