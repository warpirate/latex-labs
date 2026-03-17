import { useStore } from './store'
import TitleBar from './components/TitleBar'
import LandingScreen from './components/LandingScreen'
import Workspace from './components/Workspace'

export default function App() {
  const view = useStore((s) => s.view)

  return (
    <div className="h-screen flex flex-col bg-claude-bg">
      <TitleBar />
      {view === 'landing' ? <LandingScreen /> : <Workspace />}
    </div>
  )
}
