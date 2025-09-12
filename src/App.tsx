// import UpdateElectron from '@/components/update'
import { AIAssistant } from './components/AIAssistant'
import FileBox from './components/FileBox'
import AssistantMenu from './components/AssistantMenu/index'
import SettingsPanel from './components/SettingsPanel/index'
import Resources from './components/Resources'

function App() {
  const hash = window.location.hash
  const isFileBox = hash === '#filebox'
  const isMenu = hash === '#menu'
  const isSettings = hash === '#settings'
  const isResources = hash === '#resources'
  return (
    <div className='App'>
      <div className="app-container">
        {isFileBox ? <FileBox /> : isMenu ? <AssistantMenu /> : isSettings ? <SettingsPanel /> : isResources ? <Resources /> : <AIAssistant />}
      </div>
    </div>
  )
}

export default App