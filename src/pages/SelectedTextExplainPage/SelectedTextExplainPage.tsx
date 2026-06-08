import { Check, ChevronDown, Copy, Loader2, RefreshCcw, Sparkles, X } from 'lucide-react';
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
  triggerId?: string;
};

type SelectedTextExplainStreamEvent =
  | { type: 'connected' }
  | { type: 'progress'; data?: { message?: string; percentage?: number } }
  | { type: 'delta'; data?: { text?: string } }
  | { type: 'completed'; data?: { text?: string } }
  | { type: 'error'; data?: { message?: string } }
  | { type: 'done' };

type ExplainMode = 'detail' | 'quick';

type OutputBuffer = {
  final: string;
  pending: string;
  rendered: string;
};

const WINDOW_KEY = 'selectedTextExplain';
const TYPEWRITER_INTERVAL_MS = 22;
const EXPLAIN_MODES: ExplainMode[] = ['quick', 'detail'];

function readSelectionFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const text = (payload as SelectedTextExplainPayload).text;
  return typeof text === 'string' ? text.trim() : '';
}

function getPayloadSignature(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const source = payload as SelectedTextExplainPayload;
  const text = typeof source.text === 'string' ? source.text.trim() : '';
  if (!text) return '';
  if (typeof source.triggerId === 'string' && source.triggerId) return source.triggerId;
  const anchor = source.anchor;
  const trigger = typeof source.trigger === 'string' ? source.trigger : '';
  return JSON.stringify({
    anchor: anchor ? { x: anchor.x, y: anchor.y } : null,
    text,
    trigger
  });
}

function getTypewriterChunkSize(pendingLength: number): number {
  if (pendingLength > 600) return 24;
  if (pendingLength > 180) return 12;
  return 6;
}

function createOutputBuffer(): OutputBuffer {
  return {
    final: '',
    pending: '',
    rendered: ''
  };
}

function createOutputBuffers(): Record<ExplainMode, OutputBuffer> {
  return {
    detail: createOutputBuffer(),
    quick: createOutputBuffer()
  };
}

export default function SelectedTextExplainPage(): JSX.Element {
  const { providerId, modelId, presetId, setModelId } = useChatSelection();
  const [sourceText, setSourceText] = useState('');
  const [quickOutput, setQuickOutput] = useState('');
  const [detailOutput, setDetailOutput] = useState('');
  const [statusText, setStatusText] = useState('Ready');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRequested, setDetailRequested] = useState(false);
  const [copied, setCopied] = useState(false);
  const buffersRef = useRef<Record<ExplainMode, OutputBuffer>>(createOutputBuffers());
  const finishedRef = useRef<Record<ExplainMode, boolean>>({
    detail: false,
    quick: false
  });
  const requestIdRef = useRef<Record<ExplainMode, string | null>>({
    detail: null,
    quick: null
  });
  const requestModeRef = useRef<Record<string, ExplainMode>>({});
  const hasStreamErrorRef = useRef(false);
  const lastHydratedPayloadRef = useRef('');
  const typewriterTimerRef = useRef<number | null>(null);

  const canStart = Boolean(sourceText && providerId);
  const shortSource = useMemo(() => sourceText.replace(/\s+/g, ' ').slice(0, 260), [sourceText]);

  const stopTypewriter = useCallback((): void => {
    if (typewriterTimerRef.current === null) return;
    window.clearInterval(typewriterTimerRef.current);
    typewriterTimerRef.current = null;
  }, []);

  const clearRequestForMode = useCallback((mode: ExplainMode): void => {
    const requestId = requestIdRef.current[mode];
    if (requestId) {
      delete requestModeRef.current[requestId];
    }
    requestIdRef.current[mode] = null;
  }, []);

  const finishTypewriterIfIdle = useCallback((): boolean => {
    let hasPending = false;

    EXPLAIN_MODES.forEach((mode) => {
      const buffer = buffersRef.current[mode];
      if (buffer.pending) {
        hasPending = true;
        return;
      }

      if (!finishedRef.current[mode]) return;
      if (mode === 'quick') {
        setLoading(false);
      } else {
        setDetailLoading(false);
      }
      clearRequestForMode(mode);
    });

    if (hasPending) return false;

    stopTypewriter();
    if (!hasStreamErrorRef.current && !requestIdRef.current.quick && !requestIdRef.current.detail) {
      setStatusText('Done');
    }
    return true;
  }, [clearRequestForMode, stopTypewriter]);

  const startTypewriter = useCallback((): void => {
    if (typewriterTimerRef.current !== null) return;

    typewriterTimerRef.current = window.setInterval(() => {
      const mode = EXPLAIN_MODES.find((key) => buffersRef.current[key].pending);
      if (!mode) {
        finishTypewriterIfIdle();
        return;
      }

      const buffer = buffersRef.current[mode];
      const pending = buffer.pending;
      const chunkSize = getTypewriterChunkSize(pending.length);
      const chunk = pending.slice(0, chunkSize);
      buffer.pending = pending.slice(chunkSize);
      buffer.rendered += chunk;

      if (mode === 'quick') {
        setQuickOutput(buffer.rendered);
      } else {
        setDetailOutput(buffer.rendered);
      }

      if (!buffer.pending) {
        finishTypewriterIfIdle();
        return;
      }

      setStatusText(finishedRef.current[mode] ? 'Rendering...' : mode === 'quick' ? 'Streaming translation...' : 'Streaming details...');
    }, TYPEWRITER_INTERVAL_MS);
  }, [finishTypewriterIfIdle]);

  const resetTypewriter = useCallback(
    (mode?: ExplainMode): void => {
      stopTypewriter();
      const modes = mode ? [mode] : EXPLAIN_MODES;
      modes.forEach((key) => {
        finishedRef.current[key] = false;
        buffersRef.current[key] = createOutputBuffer();
        if (key === 'quick') {
          setQuickOutput('');
        } else {
          setDetailOutput('');
        }
      });
    },
    [stopTypewriter]
  );

  const enqueueOutputDelta = useCallback(
    (mode: ExplainMode, text: string): void => {
      if (!text) return;
      const buffer = buffersRef.current[mode];
      buffer.pending += text;
      buffer.final = buffer.rendered + buffer.pending;
      startTypewriter();
    },
    [startTypewriter]
  );

  const enqueueOutputSnapshot = useCallback(
    (mode: ExplainMode, text: string): void => {
      if (!text) return;

      const buffer = buffersRef.current[mode];
      const buffered = buffer.rendered + buffer.pending;
      buffer.final = text;
      if (text.startsWith(buffered)) {
        buffer.pending += text.slice(buffered.length);
      } else {
        buffer.rendered = '';
        buffer.pending = text;
        if (mode === 'quick') {
          setQuickOutput('');
        } else {
          setDetailOutput('');
        }
      }
      startTypewriter();
      finishTypewriterIfIdle();
    },
    [finishTypewriterIfIdle, startTypewriter]
  );

  const cancelActiveTask = useCallback(
    async (mode?: ExplainMode): Promise<void> => {
      const modes = mode ? [mode] : EXPLAIN_MODES;
      const requests = modes.map((key) => requestIdRef.current[key]).filter((id): id is string => Boolean(id));
      modes.forEach((key) => clearRequestForMode(key));
      await Promise.all(requests.map((id) => window.YUA.ai.cancelSelectedTextExplain(id).catch(() => undefined)));
    },
    [clearRequestForMode]
  );

  const startExplain = useCallback(
    async (text: string, mode: ExplainMode = 'quick'): Promise<void> => {
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
        if (mode === 'quick') {
          setLoading(false);
        } else {
          setDetailLoading(false);
        }
        return;
      }

      if (mode === 'quick') {
        await cancelActiveTask();
        resetTypewriter();
        hasStreamErrorRef.current = false;
        setDetailRequested(false);
        setDetailLoading(false);
        setCopied(false);
        setLoading(true);
        setStatusText('Connecting...');
      } else {
        await cancelActiveTask('detail');
        resetTypewriter('detail');
        hasStreamErrorRef.current = false;
        setDetailRequested(true);
        setDetailLoading(true);
        setStatusText('Loading details...');
      }

      const requestId = crypto.randomUUID();
      requestIdRef.current[mode] = requestId;
      requestModeRef.current[requestId] = mode;
      finishedRef.current[mode] = false;

      try {
        const handle = await window.YUA.ai.explainSelectedText({
          languageNames: { 'zh-CN': '中文' },
          metadata: { mode, source: 'selected-text-learning' },
          model: nextModelId,
          options: { mode },
          providerId,
          providerPresetId: presetId || undefined,
          requestId,
          targetLanguage: 'zh-CN',
          text: selectedText
        });

        if (handle.requestId !== requestId) {
          delete requestModeRef.current[requestId];
          requestIdRef.current[mode] = handle.requestId;
          requestModeRef.current[handle.requestId] = mode;
        }
      } catch (error) {
        clearRequestForMode(mode);
        if (mode === 'quick') {
          setLoading(false);
        } else {
          setDetailLoading(false);
        }
        setStatusText('Failed');
        toast.error(error instanceof Error ? error.message : 'Failed to start selected text explain');
      }
    },
    [cancelActiveTask, clearRequestForMode, modelId, presetId, providerId, resetTypewriter, setModelId]
  );

  const hydratePayload = useCallback(
    (payload: unknown): void => {
      const text = readSelectionFromPayload(payload);
      if (!text) return;
      const signature = getPayloadSignature(payload);
      if (signature && signature === lastHydratedPayloadRef.current) return;
      lastHydratedPayloadRef.current = signature;
      setSourceText(text);
      void startExplain(text, 'quick');
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
      const requestId = typeof data.requestId === 'string' ? data.requestId : '';
      const mode = requestModeRef.current[requestId];
      if (!mode) return;
      const event = data as SelectedTextExplainStreamEvent & { requestId?: string };

      if (event.type === 'connected') {
        setStatusText(mode === 'quick' ? 'Connected' : 'Loading details...');
        return;
      }
      if (event.type === 'progress') {
        setStatusText(event.data?.message || (mode === 'quick' ? 'Translating...' : 'Loading details...'));
        return;
      }
      if (event.type === 'delta' && event.data?.text) {
        enqueueOutputDelta(mode, event.data.text);
        setStatusText(mode === 'quick' ? 'Streaming translation...' : 'Streaming details...');
        return;
      }
      if (event.type === 'completed') {
        if (event.data?.text) enqueueOutputSnapshot(mode, event.data.text);
        finishedRef.current[mode] = true;
        setStatusText(buffersRef.current[mode].pending ? 'Rendering...' : 'Done');
        finishTypewriterIfIdle();
        return;
      }
      if (event.type === 'error') {
        hasStreamErrorRef.current = true;
        finishedRef.current[mode] = true;
        buffersRef.current[mode].pending = '';
        clearRequestForMode(mode);
        if (mode === 'quick') {
          setLoading(false);
        } else {
          setDetailLoading(false);
        }
        setStatusText(event.data?.message || 'Failed');
        return;
      }
      if (event.type === 'done') {
        finishedRef.current[mode] = true;
        finishTypewriterIfIdle();
      }
    };

    window.ipcRenderer?.on('renderer-message', handler as any);
    return () => {
      window.ipcRenderer?.off('renderer-message', handler as any);
    };
  }, [clearRequestForMode, enqueueOutputDelta, enqueueOutputSnapshot, finishTypewriterIfIdle]);

  useEffect(() => {
    return () => {
      void cancelActiveTask();
      stopTypewriter();
    };
  }, [cancelActiveTask, stopTypewriter]);

  const handleCopy = useCallback(async (): Promise<void> => {
    const quickText = buffersRef.current.quick.final || buffersRef.current.quick.rendered || quickOutput;
    const detailText = buffersRef.current.detail.final || buffersRef.current.detail.rendered || detailOutput;
    const content = [quickText.trim(), detailText.trim()].filter(Boolean).join('\n\n') || sourceText;
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [detailOutput, quickOutput, sourceText]);

  const handleClose = useCallback((): void => {
    void cancelActiveTask();
    resetTypewriter();
    setLoading(false);
    setDetailLoading(false);
    void window.YUA.window['window:close'](WINDOW_KEY as any);
  }, [cancelActiveTask, resetTypewriter]);

  const hasOutput = Boolean(quickOutput || detailOutput);

  return (
    <div className="h-full w-full overflow-hidden bg-transparent p-2 text-foreground">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-background/95 shadow-2xl backdrop-blur">
        <header className="drag-region flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">划词释义</h1>
              <p className="truncate text-[11px] text-muted-foreground">{statusText}</p>
            </div>
          </div>
          <div className="no-drag flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0" disabled={!sourceText || loading || detailLoading} onClick={() => void startExplain(sourceText, 'quick')}>
                  {loading ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>重新生成</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0" disabled={!hasOutput && !sourceText} onClick={() => void handleCopy()}>
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
            ) : quickOutput ? (
              <div className="space-y-3">
                <div className="prose prose-sm max-w-none select-text dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]}>
                    {quickOutput}
                  </ReactMarkdown>
                </div>

                {!detailRequested ? (
                  <Button size="sm" variant="outline" disabled={loading || detailLoading} onClick={() => void startExplain(sourceText, 'detail')}>
                    {detailLoading ? <Loader2 className="animate-spin" /> : <ChevronDown />}
                    详细释义
                  </Button>
                ) : (
                  <section className="border-t pt-3">
                    {detailOutput ? (
                      <div className="prose prose-sm max-w-none select-text dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]}>
                          {detailOutput}
                        </ReactMarkdown>
                      </div>
                    ) : detailLoading ? (
                      <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="animate-spin" />
                        正在加载详细释义
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void startExplain(sourceText, 'detail')}>
                        {detailLoading ? <Loader2 className="animate-spin" /> : <ChevronDown />}
                        重新加载详细释义
                      </Button>
                    )}
                  </section>
                )}
              </div>
            ) : loading ? (
              <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" />
                正在快速翻译
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
