import { utils } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbAlertCircle, TbBook, TbBrain, TbClock, TbPlayerStop, TbRefresh } from 'react-icons/tb';

import { ProviderModelSelect, ProviderModelSelectRef } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveModelFirstSelection } from '@/lib/ai-model-first';

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

const savePreferences = (preferences: { selectedProviderId?: string; selectedPresetId?: string; selectedModel?: string; targetLanguage?: string }): void => {
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

  const [selectedProviderId, setSelectedProviderId] = useState<string>(savedPreferences?.selectedProviderId || '');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(savedPreferences?.selectedPresetId || '');
  const [selectedModel, setSelectedModel] = useState<string>(savedPreferences?.selectedModel || '');
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);
  const [targetLanguage, setTargetLanguage] = useState<string>(savedPreferences?.targetLanguage || 'zh');

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryProgress, setSummaryProgress] = useState(0);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [parsingJson, setParsingJson] = useState<string>('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const providerSelectRef = useRef<ProviderModelSelectRef>(null);

  // 优先使用 activeSubtitle，如果没有则使用 resource
  const targetResource = activeSubtitle || resource;

  // 加载已保存的总结
  const loadSummary = useCallback(async () => {
    if (!targetResource?.id) return;

    setLoading(true);
    try {
      const summary = await window.YUA.ai.getResourceSummary(targetResource.id);
      if (summary) {
        setSummaryResult(summary);
      } else {
        setSummaryResult(null);
      }
    } catch (error) {
      console.error('加载总结失败:', error);
    } finally {
      setLoading(false);
    }
  }, [targetResource?.id]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

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
            // 总结完成后重新加载
            loadSummary();
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
  }, [loadSummary]);

  const handleProviderConfigChange = useCallback((id: string, configured: boolean) => {
    setProviderConfigured(configured);
  }, []);

  const handleOpenConfig = useCallback(async (providerId: string, fields: string[], presetId?: string) => {
    await window.YUA.window['window:open']('aiProviderConfig' as any, { providerId, presetId, fields }, { sameDisplayAsSender: true });
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

    const resolvedSelection = await resolveModelFirstSelection({
      providerId: selectedProviderId,
      modelId: selectedModel,
      preferredPresetId: selectedPresetId
    });
    if (!resolvedSelection) {
      providerSelectRef.current?.openConfig(selectedProviderId);
      return;
    }
    if (resolvedSelection.providerPresetId !== selectedPresetId) {
      setSelectedPresetId(resolvedSelection.providerPresetId);
    }

    setSummaryResult(null);
    setParsingJson('');
    setSummaryProgress(0);
    setIsSummarizing(true);

    try {
      const { requestId } = await window.YUA.ai.summarize({
        providerId: resolvedSelection.providerId,
        providerPresetId: resolvedSelection.providerPresetId,
        model: resolvedSelection.modelId,
        resourceId: targetResource.id,
        targetLanguage,
        languageNames,
        metadata: {
          resourceId: targetResource.id
        }
      });

      setCurrentRequestId(requestId);
    } catch (error) {
      console.error('总结失败:', error);
      setIsSummarizing(false);
      setSummaryProgress(0);
    }
  }, [selectedPresetId, selectedProviderId, selectedModel, targetLanguage, targetResource]);

  const handleProviderModelChange = useCallback((providerId: string, modelId: string) => {
    setSelectedProviderId((prevProviderId) => {
      if (prevProviderId && prevProviderId !== providerId) {
        setSelectedPresetId('');
      }
      return providerId;
    });
    setSelectedModel(modelId);
  }, []);

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
      selectedPresetId,
      selectedModel,
      targetLanguage
    });
  }, [selectedPresetId, selectedProviderId, selectedModel, targetLanguage]);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">加载总结数据中...</div>;
  }

  // 检查是否是视频资源且没有字幕
  const isVideo = resource?.type === 'video';
  const hasNoSubtitle = isVideo && !activeSubtitle;

  if (!summaryResult && !isSummarizing) {
    // 如果是视频但没有字幕，显示提示
    if (hasNoSubtitle) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-4">
          <TbBrain className="w-12 h-12 opacity-50" />
          <p>无法开始总结</p>
          <p className="text-xs">此视频暂无字幕文件，请先提取视频字幕</p>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-4">
        <TbBrain className="w-12 h-12 opacity-50" />
        <p>暂无总结数据</p>
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button>
              <TbBrain />
              开始总结
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-80">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">总结模型</Label>
                <ProviderModelSelect
                  ref={providerSelectRef}
                  providerId={selectedProviderId}
                  presetId={selectedPresetId}
                  modelId={selectedModel}
                  onChange={handleProviderModelChange}
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
                disabled={!selectedProviderId || !selectedModel || !targetLanguage || !providerConfigured}
              >
                开始总结
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 头部按钮 */}
      <div className="flex items-center justify-between p-2 border-b">
        <div className="flex items-center gap-2"></div>
        <div className="flex items-center gap-2">
          {isSummarizing ? (
            <Button size="icon" className="w-8 h-8" variant="ghost" onClick={handleStopSummary}>
              <TbPlayerStop className="animate-pulse" />
            </Button>
          ) : (
            <>
              <Button size="icon" className="w-8 h-8" variant="ghost" onClick={loadSummary}>
                <TbRefresh />
              </Button>
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button size="icon" className="w-8 h-8" variant="ghost" disabled={hasNoSubtitle} title={hasNoSubtitle ? '请先提取视频字幕' : undefined}>
                    <TbBrain />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">总结模型</Label>
                      <ProviderModelSelect
                        ref={providerSelectRef}
                        providerId={selectedProviderId}
                        presetId={selectedPresetId}
                        modelId={selectedModel}
                        onChange={handleProviderModelChange}
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
                      disabled={!selectedProviderId || !selectedModel || !targetLanguage || !providerConfigured}
                    >
                      {summaryResult ? '重新总结' : '开始总结'}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
          {isSummarizing && <span className="text-xs text-muted-foreground font-mono">{summaryProgress}%</span>}
          {parsingJson && <TbClock className="animate-spin" />}
        </div>
      </div>

      {/* 结果展示区域 */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {summaryResult && (
            <>
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

              {/* 简要总结 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TbBook className="h-4 w-4" />
                  <Label className="text-sm font-medium">简要总结</Label>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed bg-muted/50 p-3 rounded-md">{summaryResult.summary}</p>
              </div>

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
                          <span className="text-xs text-muted-foreground font-mono">{utils.cleanTimeDisplay(point.st)}</span>
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
                            <span className="text-xs text-muted-foreground font-mono shrink-0">{utils.cleanTimeDisplay(item.st)}</span>
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
