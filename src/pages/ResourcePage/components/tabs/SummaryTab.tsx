import { AimSegments, parser } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbAlertCircle, TbBook, TbBrain, TbClock, TbPlayerStop } from 'react-icons/tb';

import { ProviderModelSelect, ProviderModelSelectRef } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useResourceTabContext } from './ResourceTabContext';

const languageNames: Record<string, string> = {
  en: '英语',
  zh: '中文',
  ja: '日语',
  ko: '韩语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
  fr: '法语',
  pt: '葡萄牙语',
  it: '意大利语',
  ar: '阿拉伯语',
  hi: '印地语',
  vi: '越南语',
  th: '泰语'
};

const languageOptions = Object.entries(languageNames).map(([code, name]) => ({
  value: code,
  label: name
}));

interface SummaryResult {
  keywords: string[];
  summary: string;
  keyPoints: Array<{
    st: string;
    title: string;
    content: string;
  }>;
  timeline: Array<{
    st: string;
    description: string;
  }>;
}

interface SummaryHistoryItem {
  providerId?: string;
  model?: string;
  targetLanguage: string;
  timestamp: number;
}

const STORAGE_KEY = 'summary-tab-preferences';

const loadPreferences = (): Record<string, any> | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('读取总结偏好设置失败:', error);
  }
  return null;
};

const savePreferences = (preferences: { selectedProviderId?: string; selectedModel?: string; targetLanguage?: string; history?: SummaryHistoryItem[] }): void => {
  try {
    const existing = loadPreferences() || {};
    const updated = { ...existing, ...preferences };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('保存总结偏好设置失败:', error);
  }
};

/**
 * 总结 Tab 组件
 * 用于显示资源的总结内容
 */
const SummaryTab: React.FC = () => {
  const { resource, activeSubtitle } = useResourceTabContext();
  const savedPreferences = loadPreferences();

  const [subtitleEntries, setSubtitleEntries] = useState<AimSegments[]>([]);
  const [isLoadingSubtitle, setIsLoadingSubtitle] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(savedPreferences?.selectedProviderId || '');
  const [selectedModel, setSelectedModel] = useState<string>(savedPreferences?.selectedModel || '');
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);
  const [history, setHistory] = useState<SummaryHistoryItem[]>(savedPreferences?.history || []);
  const [targetLanguage, setTargetLanguage] = useState<string>(savedPreferences?.targetLanguage || 'zh');

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryProgress, setSummaryProgress] = useState(0);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [parsingJson, setParsingJson] = useState<string>('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const providerSelectRef = useRef<ProviderModelSelectRef>(null);

  // 加载字幕文件内容（优先使用 activeSubtitle，如果没有则尝试使用 resource 本身）
  useEffect(() => {
    const loadSubtitle = async () => {
      const subtitleResource = activeSubtitle || resource;
      const filePath = subtitleResource?.filePath;

      if (!filePath) {
        setSubtitleEntries([]);
        return;
      }

      // 检查是否是字幕文件
      const lower = filePath.toLowerCase();
      const isSubtitleFile = lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa');

      if (!isSubtitleFile) {
        setSubtitleEntries([]);
        return;
      }

      setIsLoadingSubtitle(true);
      try {
        const result: any = await window.YUA.file['file:readContent'](filePath);
        if (result.success) {
          try {
            const res = await parser.parseSubtitle(result.content || '');
            const segments: AimSegments[] = res?.segments || [];
            setSubtitleEntries(segments);
          } catch (error) {
            console.error('[SummaryTab] 解析字幕文件失败:', error);
            setSubtitleEntries([]);
          }
        } else {
          setSubtitleEntries([]);
        }
      } catch (error) {
        console.error('[SummaryTab] 读取字幕文件失败:', error);
        setSubtitleEntries([]);
      } finally {
        setIsLoadingSubtitle(false);
      }
    };

    loadSubtitle();
  }, [activeSubtitle, resource]);

  // 监听总结事件
  useEffect(() => {
    const handler = (_: any, payload: any): void => {
      try {
        if (payload?.type === 'summary' && payload?.data) {
          const { type, data } = payload.data;

          if (type === 'connected') {
            setIsSummarizing(true);
            setSummaryProgress(10);
          }

          if (type === 'parsing' && data?.rawContent) {
            setParsingJson(data.rawContent.substring(0, 100));
          }

          if (type === 'progress' && data) {
            if (data.percentage !== undefined) {
              setSummaryProgress(data.percentage);
            }
            if (data.parsedData) {
              setSummaryResult(data.parsedData as SummaryResult);
            }
          }

          if (type === 'completed' && data) {
            setSummaryResult(data);
            setSummaryProgress(100);
            setIsSummarizing(false);
            setParsingJson('');
          }

          if (type === 'error') {
            console.error('总结错误:', data.message);
            setIsSummarizing(false);
            setSummaryProgress(0);
            setParsingJson('');
          }

          if (type === 'done') {
            setIsSummarizing(false);
            setCurrentRequestId(null);
          }
        }
      } catch (err) {
        console.warn('[SummaryTab] Failed to parse summary message:', err);
      }
    };

    window.ipcRenderer?.on('renderer-message', handler as any);
    return () => {
      window.ipcRenderer?.off('renderer-message', handler as any);
    };
  }, []);

  const handleProviderConfigChange = useCallback((id: string, configured: boolean) => {
    setProviderConfigured(configured);
  }, []);

  const handleOpenConfig = useCallback(async (providerId: string, fields: string[]) => {
    await window.YUA.window['window:open']('aiProviderConfig' as any, { providerId, fields }, { sameDisplayAsSender: true });
  }, []);

  const addToHistory = useCallback((item: Omit<SummaryHistoryItem, 'timestamp'>) => {
    setHistory((prev) => {
      const newItem = { ...item, timestamp: Date.now() };
      const filtered = prev.filter((h) => !(h.providerId === item.providerId && h.model === item.model && h.targetLanguage === item.targetLanguage));
      return [newItem, ...filtered].slice(0, 5);
    });
  }, []);

  const applyHistory = useCallback((item: SummaryHistoryItem) => {
    setTargetLanguage(item.targetLanguage);
    if (item.providerId) setSelectedProviderId(item.providerId);
    if (item.model) setSelectedModel(item.model);
  }, []);

  const handleSummarize = useCallback(async () => {
    if (!selectedProviderId || !selectedModel || !targetLanguage) {
      return;
    }

    const isConfigured = await providerSelectRef.current?.checkConfig(selectedProviderId);
    if (!isConfigured) {
      providerSelectRef.current?.openConfig(selectedProviderId);
      return;
    }

    // 如果没有字幕数据，尝试使用 resourceId
    if (subtitleEntries.length === 0 && !activeSubtitle) {
      console.warn('[SummaryTab] 没有可总结的内容');
      return;
    }

    setSummaryResult(null);
    setParsingJson('');
    setSummaryProgress(0);
    setIsSummarizing(true);

    try {
      const subtitleResource = activeSubtitle || resource;
      const { requestId } = await window.YUA.ai.summarize({
        providerId: selectedProviderId,
        model: selectedModel,
        resourceId: subtitleResource.id,
        targetLanguage,
        languageNames,
        segments: subtitleEntries.length > 0 ? subtitleEntries : undefined,
        metadata: {
          resourceId: subtitleResource.id
        }
      });

      setCurrentRequestId(requestId);

      addToHistory({
        providerId: selectedProviderId,
        model: selectedModel,
        targetLanguage
      });
    } catch (error) {
      console.error('总结失败:', error);
      setIsSummarizing(false);
      setSummaryProgress(0);
    }
  }, [selectedProviderId, selectedModel, targetLanguage, subtitleEntries, resource.id, activeSubtitle, addToHistory]);

  const handleStopSummary = useCallback(async () => {
    if (currentRequestId) {
      await window.YUA.ai.cancelSummary(currentRequestId);
      setCurrentRequestId(null);
    }
    setIsSummarizing(false);
    setSummaryProgress(0);
    setParsingJson('');
  }, [currentRequestId]);

  useEffect(() => {
    savePreferences({
      selectedProviderId,
      selectedModel,
      targetLanguage,
      history
    });
  }, [selectedProviderId, selectedModel, targetLanguage, history]);

  const formattedTime = (timeStr: string | undefined): string => {
    if (!timeStr) {
      return '00:00:00';
    }
    const match = timeStr.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (match) {
      const [, h, m, s] = match;
      return `${h}:${m}:${s}`;
    }
    return timeStr;
  };

  const subtitleResource = activeSubtitle || resource;
  const hasContent =
    subtitleEntries.length > 0 ||
    (subtitleResource?.filePath &&
      (subtitleResource.filePath.toLowerCase().endsWith('.srt') ||
        subtitleResource.filePath.toLowerCase().endsWith('.vtt') ||
        subtitleResource.filePath.toLowerCase().endsWith('.ass') ||
        subtitleResource.filePath.toLowerCase().endsWith('.ssa')));

  // 如果有总结结果或正在总结，只显示按钮，不显示配置表单
  const showSummaryButtonOnly = summaryResult || isSummarizing;

  return (
    <div className="h-full flex flex-col relative">
      {/* 总结按钮（只在有结果或正在总结时显示在角落） */}
      {showSummaryButtonOnly && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          {isSummarizing ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleStopSummary}>
              <TbPlayerStop className="animate-pulse" />
              停止总结<span className="font-mono ml-1">({summaryProgress}%)</span>
            </Button>
          ) : (
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  <TbBrain />
                  重新总结
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                {history.length > 0 && (
                  <div className="mb-4 space-y-2 border-b pb-4">
                    <Label className="text-xs font-medium text-muted-foreground">最近使用</Label>
                    <div className="flex flex-wrap gap-2">
                      {history.map((item, index) => (
                        <Button key={index} variant="outline" size="sm" className="h-auto py-1 px-2 text-xs" onClick={() => applyHistory(item)}>
                          <span className="font-medium">
                            {item.providerId} · {item.model}
                          </span>
                          <span className="text-[10px] text-muted-foreground">→ {languageNames[item.targetLanguage] || item.targetLanguage}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">总结模型</Label>
                    <ProviderModelSelect
                      ref={providerSelectRef}
                      providerId={selectedProviderId}
                      modelId={selectedModel}
                      onChange={(providerId, modelId) => {
                        setSelectedProviderId(providerId);
                        setSelectedModel(modelId);
                      }}
                      placeholder="选择模型"
                      buttonVariant="outline"
                      buttonSize="default"
                      className="w-full justify-between"
                      autoLoadFirst={true}
                      modelTypes={['chat']}
                      showModelDetails
                      onProviderConfigChange={handleProviderConfigChange}
                      onOpenConfig={handleOpenConfig}
                    />
                    {selectedProviderId && !providerConfigured && (
                      <div className="flex items-center justify-between p-2 text-xs bg-yellow-50 border border-yellow-200 rounded-md">
                        <span className="text-yellow-800">API 配置未完成</span>
                        <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => providerSelectRef.current?.openConfig()}>
                          去配置
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">目标语言</Label>
                    <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择目标语言" />
                      </SelectTrigger>
                      <SelectContent>
                        {languageOptions.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => {
                      setIsPopoverOpen(false);
                      handleSummarize();
                    }}
                    disabled={!selectedProviderId || !selectedModel || !targetLanguage || isSummarizing || !hasContent || !providerConfigured}
                  >
                    开始总结
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {parsingJson && (
            <div className="flex items-center gap-2">
              <TbClock className="animate-spin" />
              <span className="text-xs text-muted-foreground">解析JSON中...</span>
            </div>
          )}
        </div>
      )}

      {/* 配置区域（只在没有结果且不在总结时显示） */}
      {!showSummaryButtonOnly && (
        <div className="border-b p-4 space-y-4">
          {history.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">最近使用</Label>
              <div className="flex flex-wrap gap-2">
                {history.map((item, index) => (
                  <Button key={index} variant="outline" size="sm" className="h-auto py-1 px-2 text-xs" onClick={() => applyHistory(item)}>
                    <span className="font-medium">
                      {item.providerId} · {item.model}
                    </span>
                    <span className="text-[10px] text-muted-foreground">→ {languageNames[item.targetLanguage] || item.targetLanguage}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">总结模型</Label>
              <ProviderModelSelect
                ref={providerSelectRef}
                providerId={selectedProviderId}
                modelId={selectedModel}
                onChange={(providerId, modelId) => {
                  setSelectedProviderId(providerId);
                  setSelectedModel(modelId);
                }}
                placeholder="选择模型"
                buttonVariant="outline"
                buttonSize="default"
                className="w-full justify-between"
                autoLoadFirst={true}
                modelTypes={['chat']}
                showModelDetails
                onProviderConfigChange={handleProviderConfigChange}
                onOpenConfig={handleOpenConfig}
              />
              {selectedProviderId && !providerConfigured && (
                <div className="flex items-center justify-between p-2 text-xs bg-yellow-50 border border-yellow-200 rounded-md">
                  <span className="text-yellow-800">API 配置未完成</span>
                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => providerSelectRef.current?.openConfig()}>
                    去配置
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">目标语言</Label>
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="选择目标语言" />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button className="flex-1" onClick={handleSummarize} disabled={!selectedProviderId || !selectedModel || !targetLanguage || isSummarizing || !hasContent || !providerConfigured}>
              <TbBrain className="mr-2" />
              开始总结
            </Button>
          </div>

          {/* 进度提示 */}
          {isSummarizing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {parsingJson ? (
                <>
                  <TbClock className="animate-spin" />
                  <span>解析JSON中...</span>
                </>
              ) : (
                <>
                  <TbBrain className="animate-pulse" />
                  <span>正在生成总结...</span>
                </>
              )}
              <span className="ml-auto font-mono text-xs">{summaryProgress}%</span>
            </div>
          )}
        </div>
      )}

      {/* 结果展示区域 */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {!hasContent && !isLoadingSubtitle && <div className="h-full flex items-center justify-center text-muted-foreground text-sm">请先选择字幕文件或确保资源有可总结的内容</div>}

          {isLoadingSubtitle && <div className="h-full flex items-center justify-center text-muted-foreground text-sm">正在加载字幕文件...</div>}

          {hasContent && !summaryResult && !isSummarizing && <div className="h-full flex items-center justify-center text-muted-foreground text-sm">点击"开始总结"按钮生成总结</div>}

          {summaryResult && (
            <>
              {/* 简要总结 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TbBook className="h-4 w-4" />
                  <Label className="text-sm font-medium">简要总结</Label>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed bg-muted/50 p-3 rounded-md">{summaryResult.summary}</p>
              </div>

              {/* 关键词 */}
              {summaryResult.keywords && summaryResult.keywords.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TbBook className="h-4 w-4" />
                    <Label className="text-sm font-medium">关键词</Label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {summaryResult.keywords.map((keyword, index) => (
                      <span key={index} className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-sm font-medium">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 关键点 */}
              {summaryResult.keyPoints && summaryResult.keyPoints.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TbAlertCircle className="h-4 w-4" />
                    <Label className="text-sm font-medium">关键点</Label>
                  </div>
                  <div className="space-y-3">
                    {summaryResult.keyPoints.map((point, index) => (
                      <div key={index} className="border-l-2 border-purple-500 pl-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground font-mono">{formattedTime(point.st)}</span>
                          <span className="font-medium text-foreground">{point.title}</span>
                        </div>
                        <p className="text-sm text-foreground/80 leading-relaxed">{point.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 时间线 */}
              {summaryResult.timeline && summaryResult.timeline.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TbClock className="h-4 w-4" />
                    <Label className="text-sm font-medium">时间线</Label>
                  </div>
                  <div className="relative">
                    <div className="absolute left-[3.5px] top-2 bottom-2 w-0.5 bg-gray-300 dark:bg-gray-700" />
                    <div className="space-y-3">
                      {summaryResult.timeline.map((item, index) => (
                        <div key={index} className="relative pl-6">
                          <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-green-500 ring-4 ring-background" />
                          <div className="flex items-start gap-3">
                            <span className="text-xs text-muted-foreground font-mono shrink-0">{formattedTime(item.st)}</span>
                            <span className="text-sm text-foreground/80">{item.description}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SummaryTab;
