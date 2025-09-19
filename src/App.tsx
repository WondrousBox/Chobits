// import UpdateElectron from '@/components/update'
import { AIAssistant } from './components/AIAssistant'
import FileBox from './components/FileBox'
import AssistantMenu from './components/AssistantMenu/index'
import SettingsPanel from './components/SettingsPanel/index'
import RecycleBinPage from './components/RecycleBin/Page'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import ResourcePage from './pages/ResourcePage/ResourcePage'
import WorkspaceWizard from './pages/WorkspacePage/components/WorkspaceWizard'
import WorkspacePage from './pages/WorkspacePage/WorkspacePage'

function App() {
  return (
    <HashRouter>
      <div className="w-full h-full overflow-hidden">
        <Routes>
          <Route path="/" element={<AIAssistant />} />
          <Route path="/filebox" element={<FileBox />} />
          <Route path="/menu" element={<AssistantMenu />} />
          <Route path="/settings" element={<SettingsPanel />} />
          <Route path="/workspace-wizard" element={<WorkspaceWizard />} />
          <Route path="/resources" element={<ResourcePage />} />
          <Route path="/recycle" element={<RecycleBinPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  )
}

export default App