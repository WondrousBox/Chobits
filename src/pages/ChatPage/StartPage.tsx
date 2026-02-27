import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbMicrophone, TbMicrophoneOff, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { UnifiedChatInput } from '@/components/chat';
import { Button } from '@/components/ui/button';

import ServiceInstanceSelect from './components/ServiceInstanceSelect';
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

const AssistantPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(true);
  const [closing, setClosing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const contentRootRef = useRef<HTMLDivElement | null>(null);
  const inputBlockRef = useRef<HTMLDivElement | null>(null);
  // 控制当实例下拉展开时，暂停自动尺寸调整
  const instanceMenuOpenRef = useRef<boolean>(false);

  const { providerId, instanceId, setProviderId, setInstanceId, getOrderedInstances } = useChatSelection();

  const handleToggleRecording = useCallback(async () => {
    try {
      if (isRecording) {
        await window.YUA.recorder.stop();
        setIsRecording(false);
      } else {
        await window.YUA.recorder.start();
        setIsRecording(true);
      }
    } catch (error) {
      console.error('Failed to toggle recording:', error);
      setIsRecording(false);
    }
  }, [isRecording]);

  // 进场动画结束标记
  useEffect(() => {
    const t = setTimeout(() => setOpening(false), 180);
    return () => clearTimeout(t);
  }, []);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => window.YUA.window['window:close']('assistant'), 160);
  }, [closing]);

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

  // 保存内容为资源
  const handleSave = async (content: string): Promise<void> => {
    if (!content.trim()) return;
    try {
      const res = await window.YUA.resource['resource:add']({ resource: { contentText: content } });
      if (res.success) {
        toast.success('已保存为资源');
        setQuery('');
      }
    } catch (e) {
      console.warn('[resource] save text failed', e);
      toast.error('保存失败');
    }
  };

  // 发送消息：打开聊天独立窗口并传递初始消息
  const handleSend = async (content: string): Promise<void> => {
    if (!content.trim() || !instanceId) return;
    setLoading(true);
    try {
      // 打开聊天独立窗口，传递初始消息数据
      await window.YUA.window['window:open']('chat', {
        initialMessage: content,
        providerId,
        instanceId
      });
      setQuery('');
      // 关闭助手窗口
      setTimeout(() => close(), 150);
    } catch (e) {
      console.error('[chat] open chat window failed', e);
      toast.error('打开聊天窗口失败');
    } finally {
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
      const minW = 360;
      const minH = 100;
      const desiredWidth = Math.max(minW, Math.min(currentWidth, maxW));
      const desiredHeight = Math.max(minH, Math.min(contentHeight, maxH));
      await window.YUA.window['window:size:set']('assistant', desiredWidth, desiredHeight);
    } catch {
      //
    }
  }, []);

  // 根据内容高度动态调整窗口大小
  useEffect(() => {
    let disposed = false;
    let debounceTimer: number | null = null;

    const adjustWindowSize = async (): Promise<void> => {
      try {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(async () => {
          if (disposed) return;
          if (instanceMenuOpenRef.current) return;
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
        instanceMenuOpenRef.current = open;
        const html = document.documentElement;
        const currentWidth = window.innerWidth || html.clientWidth;
        const screen = await window.YUA.window['screen:size:get']();
        const maxH = screen.height;
        if (open) {
          const extra = 360;
          const desiredHeight = Math.min(Math.max(window.innerHeight + extra, 420), maxH);
          await window.YUA.window['window:size:set']('assistant', currentWidth, desiredHeight);
        } else {
          await resizeToContent();
        }
      } catch {
        //
      }
    },
    [resizeToContent]
  );

  return (
    <div ref={contentRootRef} className="w-full h-full font-sans pointer-events-auto select-none relative drag-region">
      <div className={`w-full flex flex-col overflow-hidden transition-all duration-180 ${opening ? 'opacity-0 scale-95' : closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        <Button className="rounded-full no-drag absolute top-2 right-2 z-10" size={'icon'} variant={'ghost'} onClick={close}>
          <TbX />
        </Button>

        <div className="drag-region space-y-2">
          <div ref={inputBlockRef} className="flex items-start gap-3 relative no-drag">
            <div className="flex-1 relative">
              <UnifiedChatInput
                value={query}
                onChange={setQuery}
                placeholders={PLACEHOLDERS}
                autoFocus
                loading={loading}
                onSend={handleSend}
                onSave={handleSave}
                showSendButton={true}
                showSaveButton={true}
                onHeightChange={() => resizeToContent()}
                footerLeft={
                  <div className="shrink-0 no-drag">
                    <ServiceInstanceSelect
                      providerId={providerId}
                      instanceId={instanceId}
                      onChange={(pid, iid) => {
                        setProviderId(pid);
                        setInstanceId(iid);
                      }}
                      buttonVariant="outline"
                      buttonSize="sm"
                      orderInstances={(list, pid) => (getOrderedInstances ? getOrderedInstances(pid) : list)}
                      onOpenChange={handleMenuOpenChange}
                    />
                  </div>
                }
                footerRightExtra={
                  <Button
                    variant={'outline'}
                    size={'icon'}
                    className={`rounded-full ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'}`}
                    onClick={handleToggleRecording}
                  >
                    {isRecording ? <TbMicrophoneOff /> : <TbMicrophone />}
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantPage;
