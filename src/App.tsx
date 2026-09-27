import MapContainer from './components/Map/MapContainer'
import PWAInstallPrompt from './components/PWAInstallPrompt/PWAInstallPrompt'
import FeatureModuleLoadDialog from './components/Common/FeatureModuleLoadDialog'
import FeatureModuleLoadingOverlay from './components/Common/FeatureModuleLoadingOverlay'
import ConfigStudio from './configStudio/ConfigStudio'
import { useEffect } from 'react'
import { useFeatureModuleStore } from './store/featureModuleStore'

function App() {
  const hydrateFeatureModules = useFeatureModuleStore((state) => state.hydrate)

  useEffect(() => {
    hydrateFeatureModules()
  }, [hydrateFeatureModules])

  const isConfigStudio = new URLSearchParams(window.location.search).get('workspace') === 'config-studio'

  if (isConfigStudio) {
    return <ConfigStudio onClose={() => {
      const target = new URL(window.location.href)
      target.searchParams.delete('workspace')
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
