// import UpdateElectron from '@/components/update'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AIAssistant } from './components/AIAssistant'
import FileBox from './components/FileBox'
import AssistantMenuPage from './pages/AssistantMenuPage/AssistantMenuPage'
import SettingsPanel from './components/SettingsPanel/index'
import RecycleBinPage from './components/RecycleBin/Page'
import ResourcePage from './pages/ResourcePage/ResourcePage'
import WorkspaceWizard from './pages/WorkspacePage/components/WorkspaceWizard'
import WorkspacePage from './pages/WorkspacePage/WorkspacePage'
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
          {/* <Route path="/menu" element={<AssistantMenu />} /> */}
          <Route path="/menu" element={<AssistantMenuPage characterPosition={{ x: 300, y: 300 }} />} />
          <Route path="/settings" element={<SettingsPanel />} />
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