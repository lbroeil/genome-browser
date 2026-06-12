import { Browser } from './components/Browser'
import { ProjectPicker } from './curation/ProjectPicker'
import { CurationView } from './curation/CurationView'
import { StatsView } from './curation/StatsView'
import { useHashRoute } from './curation/router'

function App() {
  const route = useHashRoute()

  if (route === '/browser') return <Browser />

  const curate = route.match(/^\/curate\/(\d+)/)
  if (curate) return <CurationView key={curate[1]} projectId={Number(curate[1])} />

  const stats = route.match(/^\/stats\/(\d+)/)
  if (stats) return <StatsView key={stats[1]} projectId={Number(stats[1])} />

  return <ProjectPicker />
}

export default App
