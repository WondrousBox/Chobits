import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ChatSelectionProvider } from '@/components/AIAssistant/context/ChatSelectionContext';
import DownloadFloating from '@/components/DownloadFloating';
import { Toaster } from '@/components/ui/sonner';
import FileActionsMenu from '@/pages/FileActionsMenu/FileActionsMenu';
import ResourcePreviewWindow from '@/pages/ResourcePage/ResourcePreviewWindow';
import { ThemeProvider } from '@/pages/SettingsPage/providers/ThemeProvider';

import { AIAssistant } from './components/AIAssistant';
import { TooltipProvider } from './components/ui/tooltip';
import AiProviderConfigWindow from './pages/AiProviderConfigWindow/AiProviderConfigWindow';
import AssistantMenuPage from './pages/AssistantMenuPage/AssistantMenuPage';
import AssistantPage from './pages/AssistantPage/AssistantPage';
import ChatPage from './pages/AssistantPage/ChatPage';
import PluginDownloadPage from './pages/PluginPage/PluginDownloadPage';
import PluginPage from './pages/PluginPage/PluginPage';
import RecycleBinPage from './pages/ResourcePage/RecycleBinPage';
import ResourcePage from './pages/ResourcePage/ResourcePage';
import WorkflowPage from './pages/ResourcePage/WorkflowPage';
import Screenshot from './pages/Screenshot';
import WorkspacePage from './pages/SettingsPage/components/Workspace';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import StatusPage from './pages/StatusPage/StatusPage';
import TaggingPage from './pages/TaggingPage/TaggingPage';
import WorkflowBuilderPage from './pages/WorkflowBuilderPage/WorkflowBuilderPage';
import WorkflowHistoryPage from './pages/WorkflowHistoryPage/WorkflowHistoryPage';
import WorkflowStartInputWindow from './pages/WorkflowStartInputWindow/WorkflowStartInputWindow';
import WorkspaceWizard from './pages/WorkspacePage/WorkspaceWizard';

function App(): JSX.Element {
  // 监听工作流开始节点需要输入的事件
  useEffect(() => {
    const handleStartInputRequired = (_e: any, payload: { defId: string; inputMode: 'text' | 'url' | 'file'; metadata?: Record<string, any> }): void => {
      // 打开输入窗口
      window.YUA.window['window:open']('workflowStartInput' as any, payload, { sameDisplayAsSender: true }).catch(() => {
        // ignore
      });
    };

    window.ipcRenderer.on('wf:start-input-required', handleStartInputRequired);

    return () => {
      window.ipcRenderer.off('wf:start-input-required', handleStartInputRequired);
    };
  }, []);

  return (
    <ThemeProvider>
      <HashRouter>
        <ChatSelectionProvider>
          <TooltipProvider delayDuration={0}>
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
                <Route path="/plugin-download" element={<PluginDownloadPage />} />
                <Route path="/workflow/:id?" element={<WorkflowBuilderPage />} />
                <Route path="/workflow-page" element={<WorkflowPage />} />
                <Route path="/screenshot" element={<Screenshot />} />
                <Route path="/workflow-history" element={<WorkflowHistoryPage />} />
                <Route path="/ai-provider-config" element={<AiProviderConfigWindow />} />
                <Route path="/workflow-start-input" element={<WorkflowStartInputWindow />} />
                <Route path="/tagger" element={<TaggingPage />} />
                <Route path="/resource-preview" element={<ResourcePreviewWindow />} />
                <Route path="/download" element={<DownloadFloating />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <Toaster />
            </div>
          </TooltipProvider>
        </ChatSelectionProvider>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
