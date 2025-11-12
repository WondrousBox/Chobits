import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ChatSelectionProvider } from '@/components/AIAssistant/context/ChatSelectionContext';
import DownloadFloating from '@/components/DownloadFloating';
import { Toaster } from '@/components/ui/sonner';
import FileActionsMenu from '@/pages/FileActionsMenu/FileActionsMenu';
import ResourcePreviewWindow from '@/pages/ResourcePage/ResourcePreviewWindow';

import { AIAssistant } from './components/AIAssistant';
import AssistantMenuPage from './pages/AssistantMenuPage/AssistantMenuPage';
import AssistantPage from './pages/AssistantPage/AssistantPage';
import ChatPage from './pages/AssistantPage/ChatPage';
import PluginPage from './pages/PluginPage/PluginPage';
import RecycleBinPage from './pages/RecycleBinPage/RecycleBinPage';
import ResourcePage from './pages/ResourcePage/ResourcePage';
import WorkspacePage from './pages/SettingsPage/components/Workspace';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import StatusPage from './pages/StatusPage/StatusPage';
import TaggingPage from './pages/TaggingPage/TaggingPage';
import WorkflowBuilderPage from './pages/WorkflowBuilderPage/WorkflowBuilderPage';
import WorkflowPage from './pages/WorkflowPage/WorkflowPage';
import WorkspaceWizard from './pages/WorkspacePage/WorkspaceWizard';

function App(): JSX.Element {
  return (
    <HashRouter>
      <ChatSelectionProvider>
        <div className="w-full h-full overflow-hidden">
          <Routes>
            <Route path="/" element={<AIAssistant />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/menu" element={<AssistantMenuPage />} />
            <Route path="/file-actions" element={<FileActionsMenu />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/workspace-wizard" element={<WorkspaceWizard />} />
            <Route path="/resources" element={<ResourcePage />} />
            <Route path="/recycle" element={<RecycleBinPage />} />
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/plugin-manager" element={<PluginPage />} />
            <Route path="/workflow" element={<WorkflowBuilderPage />} />
            <Route path="/workflow-page" element={<WorkflowPage />} />
            <Route path="/tagger" element={<TaggingPage />} />
            <Route path="/resource-preview" element={<ResourcePreviewWindow />} />
            <Route path="/download" element={<DownloadFloating />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </div>
      </ChatSelectionProvider>
    </HashRouter>
  );
}

export default App;
