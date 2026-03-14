import { utils } from '@aim-packages/subtitle';
import React, { useMemo, useRef, useState } from 'react';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import ServicePresetSelect from '@/pages/ChatPage/components/ServicePresetSelect';

type ProgressMeta = { phase: 'start' | 'progress'; total: number; startIndex?: number; index?: number; segmentTags?: string[]; aggTop?: string[] };

type StreamApi = { requestId: string; dispose: () => void; cancel: () => Promise<any> } & { on?: any; off?: any };

const TaggingPage: React.FC = () => {
  const [input, setInput] = useState('');
  const [maxChars, setMaxChars] = useState(1200);
  const [overlap, setOverlap] = useState(120);
  const [maxLabels, setMaxLabels] = useState(8);
  const [useSmart, setUseSmart] = useState(true);
  const [segments, setSegments] = useState<{ content: string; index: number; count: number }[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ index: number; total: number; aggTop: string[] }>({ index: 0, total: 0, aggTop: [] });
  const [finalTags, setFinalTags] = useState<string[] | null>(null);
  const [initialAgg, setInitialAgg] = useState<Record<string, number>>({});
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [presetId, setPresetId] = useState<string | undefined>(undefined);
  const streamRef = useRef<StreamApi | null>(null);

  const canStart = useMemo(() => confirmed && segments.length > 0 && !running && !!providerId && !!presetId, [confirmed, segments, running, providerId, presetId]);

  const doSegment = (): void => {
    const segs = useSmart ? utils.smartChunks(input, maxChars, overlap) : utils.chunkText(input, maxChars, overlap);
    setSegments(segs);
    setConfirmed(false);
    setFinalTags(null);
    setProgress({ index: 0, total: segs.length, aggTop: [] });
    setPausedAt(null);
    setInitialAgg({});
  };

  // Provider/preset selection is handled by ServicePresetSelect; no manual fetching needed here

  const handleStart = async (resume = false): Promise<void> => {
    if (running) return;
    setRunning(true);
    setFinalTags(null);
    const startIndex = resume && pausedAt != null ? pausedAt + 1 : 0;
    const payload = {
      agentId: 'tagger',
      providerId,
      providerInstanceId: presetId,
      stream: true,
      messages: [{ role: 'user', content: input }],
      extras: {
        segments: segments.map((s) => s.content),
        maxLabels,
        startIndex,
        initialAgg
      }
    } as any;

    const api = await window.YUA.ai.chatStream(payload, (ev: any) => {
      if (ev?.type === 'metadata') {
        const data = ev.data as ProgressMeta;
        if (data.phase === 'progress') {
          setProgress({ index: (data.index ?? 0) + 1, total: data.total, aggTop: data.aggTop || [] });
        }
      } else if (ev?.type === 'message_completed') {
        try {
          const content = ev.data?.message?.content || '';
          const parsed = JSON.parse(content);
          if (parsed && Array.isArray(parsed.tags)) setFinalTags(parsed.tags);
        } catch {
          // ignore malformed tool output
        }
      } else if (ev?.type === 'done') {
        setRunning(false);
        streamRef.current = null;
      } else if (ev?.type === 'error') {
        setRunning(false);
        streamRef.current = null;
      }
    });
    streamRef.current = api as any;
  };

  const handlePause = async (): Promise<void> => {
    if (!running || !streamRef.current) return;
    try {
      await streamRef.current.cancel();
    } catch {
      // ignore cancellation errors
    }
    // Capture paused index and aggTop as seed
    setPausedAt(progress.index - 1);
    // Convert aggTop to initialAgg seeds (score=1 each) – best-effort resume
    const seeds: Record<string, number> = Object.fromEntries((progress.aggTop || []).map((t) => [t, 1]));
    setInitialAgg((prev) => ({ ...prev, ...seeds }));
    setRunning(false);
  };

  return (
    <div className="w-full h-full">
      <DragAbleTitle title={<span>🧩 文本分段与总结打标</span>} />
      <div className="w-full h-[calc(100%-36px)]">
        {/* Controls */}
        <div className="flex items-center">
          <div className="col-span-12 sm:col-span-4 lg:col-span-3">
            <div className="text-xs text-muted-foreground mb-1">模型服务预设</div>
            <ServicePresetSelect
              providerId={providerId}
              presetId={presetId}
              onChange={(pid, nextPresetId) => {
                setProviderId(pid);
                setPresetId(nextPresetId);
              }}
              buttonVariant="outline"
              className="w-full"
            />
          </div>
          <div className="col-span-4">
            <div className="text-xs text-muted-foreground mb-1">最大标签数</div>
            <Input type="number" min={1} max={50} value={maxLabels} onChange={(e) => setMaxLabels(Number(e.target.value))} />
          </div>
          <div className="col-span-4">
            <div className="text-xs text-muted-foreground mb-1">分段字符数</div>
            <Input type="number" min={200} max={4000} value={maxChars} onChange={(e) => setMaxChars(Number(e.target.value))} />
          </div>
          <div className="col-span-4">
            <div className="text-xs text-muted-foreground mb-1">重叠</div>
            <Input type="number" min={0} max={1000} value={overlap} onChange={(e) => setOverlap(Number(e.target.value))} />
          </div>
          <div className="col-span-6 flex items-center gap-2">
            <input id="smart" type="checkbox" className="accent-black" checked={useSmart} onChange={(e) => setUseSmart(e.target.checked)} />
            <label htmlFor="smart" className="text-sm">
              智能分段
            </label>
          </div>
          <div className="col-span-6 text-right">
            <Button variant="secondary" onClick={doSegment}>
              分段预览
            </Button>
          </div>
        </div>
        <div className="w-full flex gap-4" style={{ height: 'calc(100% - 156px)' }}>
          {/* Left panel */}
          <div className="flex flex-col flex-1 gap-3 overflow-y-auto ">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} className="h-full font-mono text-sm box-border resize-none" placeholder="在此粘贴需要打标的长文本..." />
          </div>

          {/* Right panel: Segments */}
          <div className="flex flex-col h-full flex-1 overflow-y-auto">
            <div className="text-sm text-muted-foreground mb-2">分段结果（{segments.length} 段）</div>
            <div className="flex-1 border rounded-lg">
              <ScrollArea className="h-full">
                <div className="divide-y">
                  {segments.map((s) => (
                    <div key={s.index} className="p-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        #{s.index + 1} · {s.content.length}字
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">{s.content}</div>
                    </div>
                  ))}
                  {segments.length === 0 && <div className="p-4 text-sm text-muted-foreground">点击“分段预览”后将在此显示分段结果，您可确认后开始打标。</div>}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* Progress & Final tags */}
        <div className="text-sm text-muted-foreground">
          进度：{progress.index}/{progress.total}，当前Top：{progress.aggTop.join('、') || '-'}
          {running ? '（运行中）' : ''}
        </div>
        {finalTags && (
          <div className="mt-2 p-3 border rounded-lg">
            <div className="text-sm font-medium mb-2">最终标签（≤{maxLabels}）</div>
            <div className="flex flex-wrap gap-2">
              {finalTags.map((t) => (
                <span key={t} className="px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="accent-black" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span className="text-sm text-muted-foreground">我已确认分段结果</span>
          </label>
          <div className="ml-auto flex items-center gap-2">
            {!running && (
              <>
                <Button disabled={!canStart} onClick={() => handleStart(false)}>
                  开始打标
                </Button>
                {pausedAt !== null && (
                  <Button variant="outline" onClick={() => handleStart(true)}>
                    继续
                  </Button>
                )}
              </>
            )}
            {running && (
              <Button variant="destructive" onClick={handlePause}>
                暂停
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaggingPage;
