import { TbMoodKid, TbSparkles } from 'react-icons/tb';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { Toaster } from '@/components/ui/sonner';
import { AIAssistant, StatusPage } from '@/features/sprite-assistant';
import { SpriteBubblePage } from '@/features/sprite-bubble';
import { useAIProviderConfig } from '@/hooks/useAIProviderConfig';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { ChatSelectionProvider } from '@/pages/ChatPage/context/ChatSelectionContext';
import ExtensionSettings from '@/pages/ExtensionSettings/ExtensionSettings';
import SpritePackEditorWindow from '@/pages/ExtensionSettings/SpritePackEditorWindow';
import SpriteSettings from '@/pages/ExtensionSettings/SpriteSettings';
import WindowAnimationEditor from '@/pages/ExtensionSettings/WindowAnimationEditor';
import { ThemeProvider } from '@/pages/SettingsPage/providers/ThemeProvider';

import { TooltipProvider } from './components/ui/tooltip';
import AiProviderConfigWindow from './pages/AiProviderConfigWindow/AiProviderConfigWindow';
import AssistantMenuPage from './pages/AssistantMenuPage/AssistantMenuPage';
import ChatPage from './pages/ChatPage/ChatPage';
import AssistantPage from './pages/ChatPage/StartPage';
import ASRConfigPage from './pages/RecordingPage/ASRConfigPage';
import RecordingPage from './pages/RecordingPage/RecordingPage';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import TTSConfigPage from './pages/TTSPage/TTSConfigPage';

function StandardAppRoutes(): JSX.Element {
  useAIProviderConfig();
  const { flags, loading } = useFeatureFlags();

  // 等待旗标加载完成再渲染路由,避免直达被开启功能的路由时因默认值闪烁而回退
  if (loading) {
    return <div className="w-full h-full overflow-hidden" />;
  }

  return (
    <ChatSelectionProvider>
      <div className="w-full h-full overflow-hidden">
        <Routes>
          <Route path="/" element={<AIAssistant />} />
          <Route path="/status" element={<StatusPage />} />
          {flags.localAi && <Route path="/asr-config" element={<ASRConfigPage />} />}
          {flags.localAi && <Route path="/asr" element={<RecordingPage />} />}
          <Route path="/tts-config" element={<TTSConfigPage />} />
          <Route path="/menu" element={<AssistantMenuPage />} />
          <Route
            path="/settings"
            element={
              <SettingsPage
                extraCategories={[
                  {
                    id: 'extensions',
                    label: '机能扩展',
                    icon: TbSparkles,
                    description: '自由移动、角色包和精灵能力',
                    component: <ExtensionSettings />
                  },
                  {
                    id: 'sprite-manager',
                    label: '精灵管理',
                    icon: TbMoodKid,
                    description: '管理桌面精灵动画资源、导入与调试动作',
                    component: <SpriteSettings />
                  }
                ]}
              />
            }
          />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/assistant-mini" element={<AssistantPage mode="mini" />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat-overlay" element={<ChatPage presentation="overlay" payloadWindowKey="chatOverlay" />} />
          <Route path="/ai-provider-config" element={<AiProviderConfigWindow />} />
          <Route path="/character-pack-editor" element={<SpritePackEditorWindow />} />
          <Route path="/window-animation-editor" element={<WindowAnimationEditor />} />
          <Route path="/sprite-bubble" element={<SpriteBubblePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </div>
    </ChatSelectionProvider>
  );
}

function App(): JSX.Element {
  return (
    <ThemeProvider>
      <HashRouter>
        <TooltipProvider delayDuration={0}>
          <StandardAppRoutes />
        </TooltipProvider>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
