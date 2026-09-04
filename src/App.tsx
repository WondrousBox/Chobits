import { TbMoodKid, TbSparkles } from 'react-icons/tb';
import { HashRouter, Route, Routes } from 'react-router-dom';

import { Toaster } from '@/components/ui/sonner';
import { SpriteApp, StatusPage } from '@/features/sprite';
import { SpriteBubblePage } from '@/features/sprite-bubble';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { ChatSelectionProvider } from '@/pages/ChatPage/context/ChatSelectionContext';
import CharacterPackEditorWindow from '@/pages/ExtensionSettings/CharacterPackEditorWindow';
import ExtensionSettings from '@/pages/ExtensionSettings/ExtensionSettings';
import SpriteSettings from '@/pages/ExtensionSettings/SpriteSettings';
import WindowAnimationEditor from '@/pages/ExtensionSettings/WindowAnimationEditor';
import { ThemeProvider } from '@/pages/SettingsPage/providers/ThemeProvider';

import { TooltipProvider } from './components/ui/tooltip';
import AIProviderConfigWindow from './pages/AIProviderConfigWindow/AIProviderConfigWindow';
import ASRConfigPage from './pages/ASRPage/ASRConfigPage';
import ASRTestPage from './pages/ASRPage/ASRTestPage';
import ChatPage from './pages/ChatPage/ChatPage';
import ChatPanelPage from './pages/ChatPage/ChatPanelPage';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import SpriteMenuPage from './pages/SpriteMenuPage/SpriteMenuPage';
import TTSConfigPage from './pages/TTSPage/TTSConfigPage';
import TTSPage from './pages/TTSPage/TTSPage';

// 兜底路由：未知路由（如 localAI 关闭时打开的 asrConfig/asrTest 窗口）渲染错误页，
// 而不是 Navigate 到 "/" 把 SpriteApp 挂进非主窗口
function UnavailablePage(): JSX.Element {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground select-none">
      <span className="text-sm">页面不可用</span>
      <span className="text-xs">该页面在当前上下文中不可用</span>
    </div>
  );
}

function StandardAppRoutes(): JSX.Element {
  const { flags, isLoading } = useFeatureFlags();

  // 等待旗标加载完成再渲染路由,避免直达被开启功能的路由时因默认值闪烁而回退
  if (isLoading) {
    return <div className="w-full h-full overflow-hidden" />;
  }

  return (
    <ChatSelectionProvider>
      <div className="w-full h-full overflow-hidden">
        <Routes>
          <Route path="/" element={<SpriteApp />} />
          <Route path="/status" element={<StatusPage />} />
          {flags.localAI && <Route path="/asr-config" element={<ASRConfigPage />} />}
          {flags.localAI && <Route path="/asr-test" element={<ASRTestPage />} />}
          <Route path="/tts-config" element={<TTSConfigPage />} />
          <Route path="/tts" element={<TTSPage />} />
          <Route path="/menu" element={<SpriteMenuPage />} />
          <Route
            path="/settings"
            element={
              <SettingsPage
                extraCategories={[
                  {
                    id: 'extensions',
                    label: '机能扩展',
                    icon: TbSparkles,
                    description: '角色包和精灵能力',
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
          <Route path="/chat-panel" element={<ChatPanelPage />} />
          <Route path="/chat-mini" element={<ChatPanelPage mode="mini" />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/ai-provider-config" element={<AIProviderConfigWindow />} />
          <Route path="/character-pack-editor" element={<CharacterPackEditorWindow />} />
          <Route path="/window-animation-editor" element={<WindowAnimationEditor />} />
          <Route path="/sprite-bubble" element={<SpriteBubblePage />} />
          <Route path="*" element={<UnavailablePage />} />
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
