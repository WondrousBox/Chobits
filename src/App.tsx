// import UpdateElectron from '@/components/update'
import { AIAssistant } from './components/AIAssistant'
import FileBox from './components/FileBox'
import AssistantMenu from './components/AssistantMenu/index'
import SettingsPanel from './components/SettingsPanel/index'
import Resources from './components/Resources'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'

function App() {
  return (
    <HashRouter>
      <div className='App'>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<AIAssistant />} />
            <Route path="/filebox" element={<FileBox />} />
            <Route path="/menu" element={<AssistantMenu />} />
            <Route path="/settings" element={<SettingsPanel />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  )
}

export default App