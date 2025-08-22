// import UpdateElectron from '@/components/update'
import { AIAssistant } from './components/AIAssistant'
import FileBox from './components/FileBox'
import AssistantMenu from './components/AssistantMenu/index'
import SettingsPanel from './components/SettingsPanel/index'

function App() {
  const hash = window.location.hash
  const isFileBox = hash === '#filebox'
  const isMenu = hash === '#menu'
  const isSettings = hash === '#settings'
  return (
    <div className='App'>
      <div className="app-container">
        {isFileBox ? <FileBox /> : isMenu ? <AssistantMenu /> : isSettings ? <SettingsPanel /> : <AIAssistant />}
      </div>
    </div>
  )
}

export default App