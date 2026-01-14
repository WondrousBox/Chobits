import { TbSparkles } from 'react-icons/tb';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import DownloadFloating from '@/components/DownloadFloating';
import { Toaster } from '@/components/ui/sonner';
import { useAIProviderConfig } from '@/hooks/useAIProviderConfig';
import { useWorkspaceCheck } from '@/hooks/useWorkspaceCheck';
import { ChatSelectionProvider } from '@/pages/ChatPage/context/ChatSelectionContext';
import ExtensionSettings from '@/pages/ExtensionSettings/ExtensionSettings';
import SkillTreeSettings from '@/pages/ExtensionSettings/SkillTreeSettings';
import FileActionsMenu from '@/pages/FileActionsMenu/FileActionsMenu';
import ResourcePreviewWindow from '@/pages/ResourcePage/ResourcePreviewWindow';
import { ThemeProvider } from '@/pages/SettingsPage/providers/ThemeProvider';

import { AIAssistant } from './components/AIAssistant';
import { TooltipProvider } from './components/ui/tooltip';
import AiProviderConfigWindow from './pages/AiProviderConfigWindow/AiProviderConfigWindow';
import ASRConfigPage from './pages/ASRPage/ASRConfigPage';
import ASRPage from './pages/ASRPage/ASRPage';
import AssistantMenuPage from './pages/AssistantMenuPage/AssistantMenuPage';
import ChatPage from './pages/ChatPage/ChatPage';
import AssistantPage from './pages/ChatPage/StartPage';
import ResourcePage from './pages/ResourcePage/ResourcePage';
import WorkflowPage from './pages/ResourcePage/WorkflowPage';
import Screenshot from './pages/Screenshot';
import WorkspacePage from './pages/SettingsPage/components/Workspace';
import PluginDownloadPage from './pages/SettingsPage/PluginDownloadPage';
import PluginPage from './pages/SettingsPage/PluginPage';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import StatusPage from './pages/StatusPage/StatusPage';
import TaggingPage from './pages/TaggingPage/TaggingPage';
import TTSConfigPage from './pages/TTSPage/TTSConfigPage';
import TTSPage from './pages/TTSPage/TTSPage';
import WorkflowBuilderPage from './pages/WorkflowBuilderPage/WorkflowBuilderPage';
import WorkflowHistoryPage from './pages/WorkflowBuilderPage/WorkflowHistoryPage';
import WorkflowStartInputSheet from './pages/WorkflowBuilderPage/WorkflowStartInputSheet';
import WorkspaceWizard from './pages/WorkspacePage/WorkspaceWizard';

function App(): JSX.Element {
  useWorkspaceCheck();
  useAIProviderConfig();

  return (
    <ThemeProvider>
      <HashRouter>
        <ChatSelectionProvider>
          <TooltipProvider delayDuration={0}>
            <div className="w-full h-full overflow-hidden">
              <Routes>
                <Route path="/" element={<AIAssistant />} />
                <Route path="/status" element={<StatusPage />} />
                <Route path="/asr-config" element={<ASRConfigPage />} />
                <Route path="/asr" element={<ASRPage />} />
                <Route path="/tts-config" element={<TTSConfigPage />} />
                <Route path="/tts" element={<TTSPage />} />
                <Route path="/menu" element={<AssistantMenuPage />} />
                <Route path="/file-actions" element={<FileActionsMenu />} />
                <Route
                  path="/settings"
                  element={
                    <SettingsPage
                      extraCategories={[
                        {
                          id: 'extensions',
                          label: '机能扩展',
                          icon: TbSparkles,
                          description: '自由移动、日常关心',
                          component: <ExtensionSettings />
                        }
                      ]}
                    />
                  }
                />
                <Route path="/workspace-wizard" element={<WorkspaceWizard />} />
                <Route path="/resources/*" element={<ResourcePage />} />
                <Route path="/workspace" element={<WorkspacePage />} />
                <Route path="/assistant" element={<AssistantPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/plugin-manager" element={<PluginPage />} />
                <Route path="/plugin-download" element={<PluginDownloadPage />} />
                <Route path="/workflow" element={<WorkflowBuilderPage />} />
                <Route path="/workflow/:id" element={<WorkflowBuilderPage />} />
                <Route path="/workflow-page" element={<WorkflowPage />} />
                <Route path="/screenshot" element={<Screenshot />} />
                <Route path="/workflow-history" element={<WorkflowHistoryPage />} />
                <Route path="/ai-provider-config" element={<AiProviderConfigWindow />} />
                <Route path="/tagger" element={<TaggingPage />} />
                <Route path="/resource-preview" element={<ResourcePreviewWindow />} />
                <Route path="/download" element={<DownloadFloating />} />
                <Route path="/skill-tree" element={<SkillTreeSettings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <Toaster />
              <WorkflowStartInputSheet />
            </div>
          </TooltipProvider>
        </ChatSelectionProvider>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
