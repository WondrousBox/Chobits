// import UpdateElectron from '@/components/update'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AIAssistant } from './components/AIAssistant'
import FileBox from './components/FileBox'
import AssistantMenuPage from './pages/AssistantMenuPage/AssistantMenuPage'
import SettingsPage from './pages/SettingsPage/SettingsPage'
import RecycleBinPage from './pages/RecycleBinPage/RecycleBinPage'
import ResourcePage from './pages/ResourcePage/ResourcePage'
import WorkspaceWizard from './pages/WorkspacePage/WorkspaceWizard'
import WorkspacePage from './pages/SettingsPage/components/Workspace'
import AssistantPage from './pages/AssistantPage/AssistantPage'
import ModelPage from './pages/ModelPage/ModelPage'
import ResourcePreviewWindow from '@/pages/ResourcePage/ResourcePreviewWindow'
import DownloadFloating from '@/components/DownloadFloating'

function App() {
  return (
    <HashRouter>
      <div className="w-full h-full overflow-hidden">
        <Routes>
          <Route path="/" element={<AIAssistant />} />
          <Route path="/filebox" element={<FileBox />} />
          <Route path="/menu" element={<AssistantMenuPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/workspace-wizard" element={<WorkspaceWizard />} />
          <Route path="/resources" element={<ResourcePage />} />
          <Route path="/recycle" element={<RecycleBinPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/model-manager" element={<ModelPage />} />
          <Route path="/resource-preview" element={<ResourcePreviewWindow />} />
          <Route path="/download-floating" element={<DownloadFloating />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  )
}

export default App