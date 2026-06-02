import { Check, Copy, Loader2, RefreshCcw, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatSelection } from '@/pages/ChatPage/context/ChatSelectionContext';

type SelectedTextExplainPayload = {
  anchor?: { x: number; y: number };
  text?: string;
  trigger?: 'hotkey' | 'manual' | string;
};

type SelectedTextExplainStreamEvent =
  | { type: 'connected' }
  | { type: 'progress'; data?: { message?: string; percentage?: number } }
  | { type: 'delta'; data?: { text?: string } }
  | { type: 'completed'; data?: { text?: string } }
  | { type: 'error'; data?: { message?: string } }
  | { type: 'done' };

const WINDOW_KEY = 'selectedTextExplain';
const TYPEWRITER_INTERVAL_MS = 22;

function readSelectionFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const text = (payload as SelectedTextExplainPayload).text;
  return typeof text === 'string' ? text.trim() : '';
}

function getTypewriterChunkSize(pendingLength: number): number {
  if (pendingLength > 600) return 24;
  if (pendingLength > 180) return 12;
  return 6;
}

export default function SelectedTextExplainPage(): JSX.Element {
  const { providerId, modelId, presetId, setModelId } = useChatSelection();
  const [sourceText, setSourceText] = useState('');
  const [output, setOutput] = useState('');
  const [statusText, setStatusText] = useState('Ready');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const explainFinishedRef = useRef(false);
  const finalOutputRef = useRef('');
  const pendingOutputRef = useRef('');
  const renderedOutputRef = useRef('');
  const requestIdRef = useRef<string | null>(null);
  const typewriterTimerRef = useRef<number | null>(null);

  const canStart = Boolean(sourceText && providerId && modelId);
  const shortSource = useMemo(() => sourceText.replace(/\s+/g, ' ').slice(0, 260), [sourceText]);

  const stopTypewriter = useCallback((): void => {
    if (typewriterTimerRef.current === null) return;
    window.clearInterval(typewriterTimerRef.current);
    typewriterTimerRef.current = null;
  }, []);

  const finishTypewriterIfIdle = useCallback((): boolean => {
    if (!explainFinishedRef.current || pendingOutputRef.current) return false;
    stopTypewriter();
    setStatusText('Done');
    setLoading(false);
    requestIdRef.current = null;
    return true;
  }, [stopTypewriter]);

  const startTypewriter = useCallback((): void => {
    if (typewriterTimerRef.current !== null) return;

    typewriterTimerRef.current = window.setInterval(() => {
      const pending = pendingOutputRef.current;
      if (!pending) {
        finishTypewriterIfIdle();
        return;
      }

      const chunkSize = getTypewriterChunkSize(pending.length);
      const chunk = pending.slice(0, chunkSize);
      pendingOutputRef.current = pending.slice(chunkSize);
      renderedOutputRef.current += chunk;
      setOutput(renderedOutputRef.current);

      if (!pendingOutputRef.current) {
        finishTypewriterIfIdle();
        return;
      }

      setStatusText(explainFinishedRef.current ? 'Rendering...' : 'Streaming...');
    }, TYPEWRITER_INTERVAL_MS);
  }, [finishTypewriterIfIdle]);

  const resetTypewriter = useCallback((): void => {
    stopTypewriter();
    explainFinishedRef.current = false;
    finalOutputRef.current = '';
    pendingOutputRef.current = '';
    renderedOutputRef.current = '';
    setOutput('');
  }, [stopTypewriter]);

  const enqueueOutputDelta = useCallback(
    (text: string): void => {
      if (!text) return;
      pendingOutputRef.current += text;
      finalOutputRef.current = renderedOutputRef.current + pendingOutputRef.current;
      startTypewriter();
    },
    [startTypewriter]
  );

  const enqueueOutputSnapshot = useCallback(
    (text: string): void => {
      if (!text) return;

      const buffered = renderedOutputRef.current + pendingOutputRef.current;
      finalOutputRef.current = text;
      if (text.startsWith(buffered)) {
        pendingOutputRef.current += text.slice(buffered.length);
      } else {
        renderedOutputRef.current = '';
        pendingOutputRef.current = text;
        setOutput('');
      }
      startTypewriter();
      finishTypewriterIfIdle();
    },
    [finishTypewriterIfIdle, startTypewriter]
  );

  const cancelActiveTask = useCallback(async (): Promise<void> => {
    const requestId = requestIdRef.current;
    if (!requestId) return;
    requestIdRef.current = null;
    await window.YUA.ai.cancelSelectedTextExplain(requestId).catch(() => undefined);
  }, []);

  const startExplain = useCallback(
    async (text: string): Promise<void> => {
      const selectedText = text.trim();
      if (!selectedText) return;
      if (!providerId) {
        setStatusText('No AI provider selected');
        return;
      }

      let nextModelId = modelId;
      if (!nextModelId) {
        const models = await window.YUA.ai.listModels(providerId, presetId || undefined).catch(() => []);
        nextModelId = models[0]?.id || '';
        if (nextModelId) setModelId(nextModelId);
      }

      if (!nextModelId) {
        setStatusText('No chat model selected');
        setLoading(false);
        return;
      }

      await cancelActiveTask();
      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;
      resetTypewriter();
      setCopied(false);
      setLoading(true);
      setStatusText('Connecting...');

      try {
        const handle = await window.YUA.ai.explainSelectedText({
          languageNames: { 'zh-CN': '中文' },
          metadata: { source: 'selected-text-learning' },
          model: nextModelId,
          providerId,
          providerPresetId: presetId || undefined,
          requestId,
          targetLanguage: 'zh-CN',
          text: selectedText
        });
        requestIdRef.current = handle.requestId;
      } catch (error) {
        requestIdRef.current = null;
        setLoading(false);
        setStatusText('Failed');
        toast.error(error instanceof Error ? error.message : 'Failed to start selected text explain');
      }
    },
    [cancelActiveTask, modelId, presetId, providerId, resetTypewriter, setModelId]
  );

  const hydratePayload = useCallback(
    (payload: unknown): void => {
      const text = readSelectionFromPayload(payload);
      if (!text) return;
      setSourceText(text);
      void startExplain(text);
    },
    [startExplain]
  );

  useEffect(() => {
    const handler = (_event: unknown, payload: unknown): void => hydratePayload(payload);
    window.ipcRenderer?.on('on:window:open:ready', handler as any);

    const timer = window.setTimeout(async () => {
      try {
        const cached = await window.YUA.window['window:payload:get'](WINDOW_KEY as any);
        hydratePayload(cached);
      } catch {
        /* noop */
      } finally {
        await window.YUA.window['window:open:ready'](WINDOW_KEY as any).catch(() => undefined);
      }
    }, 80);

    return () => {
      window.clearTimeout(timer);
      window.ipcRenderer?.off('on:window:open:ready', handler as any);
    };
  }, [hydratePayload]);

  useEffect(() => {
    const handler = (_event: unknown, message: { data?: any; type?: string }): void => {
      if (message?.type !== 'selected-text:explain') return;
      const data = message.data || {};
      if (data.requestId !== requestIdRef.current) return;
      const event = data as SelectedTextExplainStreamEvent & { requestId?: string };

      if (event.type === 'connected') {
        setStatusText('Connected');
        return;
      }
      if (event.type === 'progress') {
        setStatusText(event.data?.message || 'Running...');
        return;
      }
      if (event.type === 'delta' && event.data?.text) {
        enqueueOutputDelta(event.data.text);
        setStatusText('Streaming...');
        return;
      }
      if (event.type === 'completed') {
        if (event.data?.text) enqueueOutputSnapshot(event.data.text);
        explainFinishedRef.current = true;
        setStatusText(pendingOutputRef.current ? 'Rendering...' : 'Done');
        finishTypewriterIfIdle();
        return;
      }
      if (event.type === 'error') {
        explainFinishedRef.current = true;
        stopTypewriter();
        pendingOutputRef.current = '';
        setStatusText(event.data?.message || 'Failed');
        setLoading(false);
        requestIdRef.current = null;
        return;
      }
      if (event.type === 'done') {
        explainFinishedRef.current = true;
        finishTypewriterIfIdle();
      }
    };

    window.ipcRenderer?.on('renderer-message', handler as any);
    return () => {
      window.ipcRenderer?.off('renderer-message', handler as any);
    };
  }, [enqueueOutputDelta, enqueueOutputSnapshot, finishTypewriterIfIdle, stopTypewriter]);

  useEffect(() => {
    return () => {
      void cancelActiveTask();
      stopTypewriter();
    };
  }, [cancelActiveTask, stopTypewriter]);

  const handleCopy = useCallback(async (): Promise<void> => {
    const content = (finalOutputRef.current || renderedOutputRef.current || output).trim() || sourceText;
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [output, sourceText]);

  const handleClose = useCallback((): void => {
    void cancelActiveTask();
    resetTypewriter();
    setLoading(false);
    void window.YUA.window['window:close'](WINDOW_KEY as any);
  }, [cancelActiveTask, resetTypewriter]);

  return (
    <div className="h-full w-full overflow-hidden bg-transparent p-2 text-foreground">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-background/95 shadow-2xl backdrop-blur">
        <header className="drag-region flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">划词解释</h1>
              <p className="truncate text-[11px] text-muted-foreground">{statusText}</p>
            </div>
          </div>
          <div className="no-drag flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0" disabled={!sourceText || loading} onClick={() => void startExplain(sourceText)}>
                  {loading ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>重新生成</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0" disabled={!output && !sourceText} onClick={() => void handleCopy()}>
                  {copied ? <Check /> : <Copy />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>复制</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0" onClick={handleClose}>
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>关闭</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <section className="no-drag border-b bg-muted/30 px-3 py-2">
          <p className="line-clamp-3 select-text text-xs leading-5 text-muted-foreground">{shortSource || 'No selected text'}</p>
        </section>

        <ScrollArea className="no-drag min-h-0 flex-1">
          <main className="p-3">
            {!sourceText ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">等待选中文本</div>
            ) : output ? (
              <div className="prose prose-sm max-w-none select-text dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]}>
                  {output}
                </ReactMarkdown>
              </div>
            ) : loading ? (
              <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                正在生成
              </div>
            ) : canStart ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">准备就绪</div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <p>需要先配置聊天模型</p>
                <Button size="sm" variant="outline" onClick={() => window.YUA.window['window:open']('settings' as any, { category: 'ai' }, { sameDisplayAsSender: true })}>
                  打开 AI 设置
                </Button>
              </div>
            )}
          </main>
        </ScrollArea>
      </div>
    </div>
  );
}
