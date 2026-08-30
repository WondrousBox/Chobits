import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { AssistantMiniInputWithService, ChatInputWithService, type ChatInputWithServiceProps } from '@/components/chat';
import { Button } from '@/components/ui/button';
import { ensureChatApiConfigGoal, guideChatApiConfigIfNeeded } from '@/lib/chat-api-config-guide';

import { CHAT_OVERLAY_SETTINGS } from './chat-overlay-settings';
import { useChatSelection } from './context/ChatSelectionContext';

const PLACEHOLDERS = [
  '输入问题，如：总结最近导入的 PDF...',
  '粘贴一段文字，让我帮你提炼要点',
  '帮我把这段中文翻译成英文',
  '写一个 TypeScript 函数组件示例',
  '下载这个视频并提取字幕',
  '分析这个网页并输出摘要',
  '检索资源库中关于「会议纪要」的内容'
];
const MENU_RESERVE_HEIGHT = 360;

type AssistantStartParams = Parameters<ChatInputWithServiceProps['onStart']>[0];
type AssistantWindowMode = 'standard' | 'mini';

interface AssistantPageProps {
  mode?: AssistantWindowMode;
}

const AssistantPage: React.FC<AssistantPageProps> = ({ mode = 'standard' }) => {
  const isMini = mode === 'mini';
  const windowKey = isMini ? 'assistantMini' : 'assistant';
  const [opening, setOpening] = useState(true);
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const contentRootRef = useRef<HTMLDivElement | null>(null);
  const inputBlockRef = useRef<HTMLDivElement | null>(null);
  // 控制当模型下拉展开时，暂停自动尺寸调整
  const modelMenuOpenRef = useRef<boolean>(false);
  const openMenuCountRef = useRef<number>(0);
  const menuResizeResumeTimerRef = useRef<number | null>(null);
  const visibilityOpenTimerRef = useRef<number | null>(null);
  const sendingRef = useRef(false);

  const { setPresetId } = useChatSelection();

  useEffect(() => {
    void guideChatApiConfigIfNeeded({ trigger: 'assistant-window-open' });
  }, []);

  // 进场动画结束标记
  useEffect(() => {
    const t = setTimeout(() => setOpening(false), 180);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = (_event: any, data: { visible: boolean; key: string }): void => {
      if (data.key !== windowKey || !data.visible) return;
      if (visibilityOpenTimerRef.current) {
        window.clearTimeout(visibilityOpenTimerRef.current);
      }
      setClosing(false);
      setOpening(true);
      visibilityOpenTimerRef.current = window.setTimeout(() => {
        visibilityOpenTimerRef.current = null;
        setOpening(false);
      }, 180);
    };

    window.ipcRenderer?.on('window:visibility-changed', handleVisibilityChange);
    return () => {
      if (visibilityOpenTimerRef.current) {
        window.clearTimeout(visibilityOpenTimerRef.current);
        visibilityOpenTimerRef.current = null;
      }
      window.ipcRenderer?.off('window:visibility-changed', handleVisibilityChange);
    };
  }, [windowKey]);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => window.YUA.window['window:close'](windowKey), 160);
  }, [closing, windowKey]);

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // 发送消息：打开聊天独立窗口并传递初始消息
  const handleSend = async ({
    content,
    providerId,
    modelId,
    preferredPresetId,
    agentId,
    codingWorkspaceRoot,
    codingWorkspaceLabel,
    webSearchEnabled,
    characterPersonaEnabled
  }: AssistantStartParams): Promise<void> => {
    if (!content.trim() || !providerId || !modelId) return;
    if (sendingRef.current) return;
    sendingRef.current = true;
    setLoading(true);
    try {
      const resolvedPreset = await window.YUA.ai.resolveUsablePreset(providerId, preferredPresetId);
      if (!resolvedPreset?.id) {
        await ensureChatApiConfigGoal({ providerId, preferredPresetId, trigger: 'chat-send' });
        toast.error('当前服务商还没有可用预设，请先到 AI 设置中完成配置');
        return;
      }
      if (resolvedPreset.id !== preferredPresetId) {
        setPresetId(resolvedPreset.id);
      }

      // 打开聊天独立窗口，传递初始消息数据
      const targetWindow = CHAT_OVERLAY_SETTINGS.enabledFromAssistantInput ? 'chatOverlay' : 'chat';
      const requestId = `assistant-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await window.YUA.window['window:open'](targetWindow as any, {
        requestId,
        initialMessage: content,
        providerId,
        modelId,
        preferredPresetId: resolvedPreset.id,
        agentId,
        codingWorkspaceRoot,
        codingWorkspaceLabel,
        webSearchEnabled,
        characterPersonaEnabled,
        ...(targetWindow === 'chatOverlay' ? { overlaySide: CHAT_OVERLAY_SETTINGS.side } : {})
      });
      // 关闭助手窗口
      setTimeout(() => close(), 150);
    } catch (e) {
      console.error('[chat] open chat window failed', e);
      toast.error('打开聊天窗口失败');
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  };

  // 统一封装：根据内容高度调整窗口大小
  const resizeToContent = useCallback(async () => {
    try {
      const html = document.documentElement;
      const blockEl = inputBlockRef.current;
      const blockRect = blockEl?.getBoundingClientRect();
      const extraMargin = 12;
      const contentHeight = Math.ceil((blockRect?.bottom ?? window.innerHeight) + extraMargin);
      const currentWidth = window.innerWidth || html.clientWidth;
      const screen = await window.YUA.window['screen:size:get']();
      const maxW = screen.width;
      const maxH = screen.height;
      const minW = isMini ? 320 : 360;
      const minH = isMini ? 56 : 100;
      const desiredWidth = Math.max(minW, Math.min(currentWidth, maxW));
      const desiredHeight = Math.max(minH, Math.min(contentHeight, maxH));
      await window.YUA.window['window:size:set'](windowKey, desiredWidth, desiredHeight);
    } catch {
      //
    }
  }, [isMini, windowKey]);

  const resizeForOpenMenu = useCallback(async () => {
    try {
      const html = document.documentElement;
      const blockEl = inputBlockRef.current;
      const blockRect = blockEl?.getBoundingClientRect();
      const extraMargin = 12;
      const contentHeight = Math.ceil((blockRect?.bottom ?? window.innerHeight) + extraMargin);
      const currentWidth = window.innerWidth || html.clientWidth;
      const screen = await window.YUA.window['screen:size:get']();
      const maxW = screen.width;
      const maxH = screen.height;
      const minW = isMini ? 320 : 360;
      const minH = isMini ? 56 : 100;
      const desiredWidth = Math.max(minW, Math.min(currentWidth, maxW));
      const desiredHeight = Math.max(minH, Math.min(contentHeight + MENU_RESERVE_HEIGHT, maxH));
      await window.YUA.window['window:size:set'](windowKey, desiredWidth, desiredHeight);
    } catch {
      //
    }
  }, [isMini, windowKey]);

  // 根据内容高度动态调整窗口大小
  useEffect(() => {
    let disposed = false;
    let debounceTimer: number | null = null;

    const adjustWindowSize = async (): Promise<void> => {
      try {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(async () => {
          if (disposed) return;
          if (modelMenuOpenRef.current) return;
          await resizeToContent();
        }, 90);
      } catch {
        //
      }
    };

    adjustWindowSize();

    const target = inputBlockRef.current || contentRootRef.current || document.body;
    const ro = new ResizeObserver(() => adjustWindowSize());
    try {
      ro.observe(target);
    } catch {
      /* noop */
    }

    const onWinResize = (): Promise<void> => adjustWindowSize();
    window.addEventListener('resize', onWinResize);

    return () => {
      disposed = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      try {
        ro.disconnect();
      } catch {
        //
      }
      window.removeEventListener('resize', onWinResize);
    };
  }, [resizeToContent]);

  // 当菜单展开时，临时增高窗口
  const handleMenuOpenChange = useCallback(
    async (open: boolean) => {
      try {
        if (menuResizeResumeTimerRef.current) {
          window.clearTimeout(menuResizeResumeTimerRef.current);
          menuResizeResumeTimerRef.current = null;
        }
        if (open) {
          openMenuCountRef.current += 1;
          modelMenuOpenRef.current = true;
        } else {
          openMenuCountRef.current = Math.max(0, openMenuCountRef.current - 1);
          menuResizeResumeTimerRef.current = window.setTimeout(() => {
            menuResizeResumeTimerRef.current = null;
            if (openMenuCountRef.current > 0) {
              return;
            }
            modelMenuOpenRef.current = false;
            void resizeToContent();
          }, 120);
          return;
        }

        await resizeForOpenMenu();
      } catch {
        //
      }
    },
    [resizeForOpenMenu, resizeToContent]
  );

  const handleInputHeightChange = useCallback(() => {
    if (modelMenuOpenRef.current) {
      return;
    }
    void resizeToContent();
  }, [resizeToContent]);

  const handleMenuOpenPrepare = useCallback(() => {
    modelMenuOpenRef.current = true;
    if (menuResizeResumeTimerRef.current) {
      window.clearTimeout(menuResizeResumeTimerRef.current);
      menuResizeResumeTimerRef.current = null;
    }
    void resizeForOpenMenu();
  }, [resizeForOpenMenu]);

  return (
    <div ref={contentRootRef} className="w-full h-full font-sans pointer-events-auto select-none relative drag-region">
      <div className={`w-full flex flex-col overflow-hidden transition-all duration-180 ${opening ? 'opacity-0 scale-95' : closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        {!isMini && (
          <Button className="rounded-full no-drag absolute top-2 right-2 z-10" size={'icon'} variant={'ghost'} onClick={close}>
            <TbX />
          </Button>
        )}

        <div className={isMini ? 'no-drag pointer-events-auto' : 'no-drag pointer-events-auto space-y-2'}>
          {/* 常用功能快捷入口 */}
          <div ref={inputBlockRef} className="flex items-start gap-3 relative">
            <div className="flex-1 relative">
              {isMini ? (
                <AssistantMiniInputWithService
                  autoFocus
                  loading={loading}
                  placeholder="问点什么..."
                  onStart={handleSend}
                  onMenuOpenChange={handleMenuOpenChange}
                  onMenuOpenPrepare={handleMenuOpenPrepare}
                />
              ) : (
                <ChatInputWithService
                  placeholders={PLACEHOLDERS}
                  autoFocus
                  loading={loading}
                  menuPlacement="assistant-floating"
                  onStart={handleSend}
                  onHeightChange={handleInputHeightChange}
                  onMenuOpenChange={handleMenuOpenChange}
                  onMenuOpenPrepare={handleMenuOpenPrepare}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantPage;
