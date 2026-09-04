import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { ChatInputWithService, type ChatInputWithServiceProps, ChatMiniInputWithService } from '@/components/chat';
import { Button } from '@/components/ui/button';
import { ensureChatApiConfigGoal, guideChatApiConfigIfNeeded } from '@/lib/chat-api-config-guide';

import { useChatSelection } from './context/ChatSelectionContext';

const PLACEHOLDERS = [
  '输入问题开始对话，可开启联网搜索',
  '粘贴一段文字，让我帮你提炼要点',
  '帮我把这段中文翻译成英文',
  '写一个 TypeScript 函数组件示例',
  '分析这个网页并输出摘要',
  '输入 / 开头的指令可快速调用技能'
];
const MENU_RESERVE_HEIGHT = 360;

type ChatStartParams = Parameters<ChatInputWithServiceProps['onStart']>[0];
type ChatWindowMode = 'standard' | 'mini';

interface ChatPanelPageProps {
  mode?: ChatWindowMode;
}

const ChatPanelPage: React.FC<ChatPanelPageProps> = ({ mode = 'standard' }) => {
  const isMini = mode === 'mini';
  const windowKey = isMini ? 'chatMini' : 'chatPanel';
  const [isOpening, setIsOpening] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
    void guideChatApiConfigIfNeeded({ trigger: 'sprite-window-open' });
  }, []);

  // 进场动画结束标记
  useEffect(() => {
    const t = setTimeout(() => setIsOpening(false), 180);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = (data: { visible: boolean; key: string }): void => {
      if (data.key !== windowKey || !data.visible) return;
      if (visibilityOpenTimerRef.current) {
        window.clearTimeout(visibilityOpenTimerRef.current);
      }
      setIsClosing(false);
      setIsOpening(true);
      visibilityOpenTimerRef.current = window.setTimeout(() => {
        visibilityOpenTimerRef.current = null;
        setIsOpening(false);
      }, 180);
    };

    const unsubscribeVisibility = window.chobits.window.onVisibilityChanged(handleVisibilityChange);
    return () => {
      if (visibilityOpenTimerRef.current) {
        window.clearTimeout(visibilityOpenTimerRef.current);
        visibilityOpenTimerRef.current = null;
      }
      unsubscribeVisibility();
    };
  }, [windowKey]);

  const close = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => window.chobits.window['window:close'](windowKey), 160);
  }, [isClosing, windowKey]);

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
    characterPromptEnabled
  }: ChatStartParams): Promise<void> => {
    if (!content.trim() || !providerId || !modelId) return;
    if (sendingRef.current) return;
    sendingRef.current = true;
    setIsLoading(true);
    try {
      const resolvedPreset = await window.chobits.ai.resolveUsablePreset(providerId, preferredPresetId);
      if (!resolvedPreset?.id) {
        await ensureChatApiConfigGoal({ providerId, preferredPresetId, trigger: 'chat-send' });
        toast.error('当前服务商还没有可用预设，请先到 AI 设置中完成配置');
        return;
      }
      if (resolvedPreset.id !== preferredPresetId) {
        setPresetId(resolvedPreset.id);
      }

      // 打开聊天独立窗口，传递初始消息数据
      const requestId = `${isMini ? 'chat-mini' : 'chat-panel'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await window.chobits.window['window:open']('chat' as any, {
        requestId,
        initialMessage: content,
        providerId,
        modelId,
        preferredPresetId: resolvedPreset.id,
        agentId,
        codingWorkspaceRoot,
        codingWorkspaceLabel,
        webSearchEnabled,
        characterPromptEnabled
      });
      // 关闭助手窗口
      setTimeout(() => close(), 150);
    } catch (e) {
      console.error('[chat] open chat window failed', e);
      toast.error('打开聊天窗口失败');
    } finally {
      sendingRef.current = false;
      setIsLoading(false);
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
      const screen = await window.chobits.window['screen:size:get']();
      const maxW = screen.width;
      const maxH = screen.height;
      const minW = isMini ? 320 : 360;
      const minH = isMini ? 56 : 100;
      const desiredWidth = Math.max(minW, Math.min(currentWidth, maxW));
      const desiredHeight = Math.max(minH, Math.min(contentHeight, maxH));
      await window.chobits.window['window:size:set'](windowKey, desiredWidth, desiredHeight);
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
      const screen = await window.chobits.window['screen:size:get']();
      const maxW = screen.width;
      const maxH = screen.height;
      const minW = isMini ? 320 : 360;
      const minH = isMini ? 56 : 100;
      const desiredWidth = Math.max(minW, Math.min(currentWidth, maxW));
      const desiredHeight = Math.max(minH, Math.min(contentHeight + MENU_RESERVE_HEIGHT, maxH));
      await window.chobits.window['window:size:set'](windowKey, desiredWidth, desiredHeight);
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
      <div className={`w-full flex flex-col overflow-hidden transition-all duration-180 ${isOpening ? 'opacity-0 scale-95' : isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
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
                <ChatMiniInputWithService
                  autoFocus
                  isLoading={isLoading}
                  placeholder="问点什么..."
                  onStart={handleSend}
                  onMenuOpenChange={handleMenuOpenChange}
                  onMenuOpenPrepare={handleMenuOpenPrepare}
                />
              ) : (
                <ChatInputWithService
                  placeholders={PLACEHOLDERS}
                  autoFocus
                  isLoading={isLoading}
                  menuPlacement="chat-floating"
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

export default ChatPanelPage;
