import { throttle } from 'lodash';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbPlayerStop, TbRefresh, TbSitemap } from 'react-icons/tb';

import { ProviderModelSelect, ProviderModelSelectRef } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

const STORAGE_KEY = 'mindmap-tab-preferences';

const loadPreferences = (): Record<string, any> | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('读取脑图偏好设置失败:', error);
  }
  return null;
};

const savePreferences = (preferences: { selectedProviderId?: string; selectedPresetId?: string; selectedModel?: string; targetLanguage?: string }): void => {
  try {
    const existing = loadPreferences() || {};
    const updated = { ...existing, ...preferences };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('保存脑图偏好设置失败:', error);
  }
};

/**
 * 脑图 Tab 组件
 * 用于生成和显示思维导图
 */
const MindmapTab: React.FC = () => {
  const { resource, activeSubtitle } = useResourceTabContext();
  const savedPreferences = loadPreferences();

  const [selectedProviderId, setSelectedProviderId] = useState<string>(savedPreferences?.selectedProviderId || '');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(savedPreferences?.selectedPresetId || '');
  const [selectedModel, setSelectedModel] = useState<string>(savedPreferences?.selectedModel || '');
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);
  const [targetLanguage, setTargetLanguage] = useState<string>(savedPreferences?.targetLanguage || 'zh');

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const providerSelectRef = useRef<ProviderModelSelectRef>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapRef = useRef<Markmap | null>(null);

  // 优先使用 activeSubtitle，如果没有则使用 resource
  const targetResource = activeSubtitle || resource;
  const targetResourceId = targetResource?.id;

  // 加载已保存的脑图
  const loadMindmap = useCallback(async (): Promise<void> => {
    if (!targetResourceId) return;

    try {
      const mindmapData = await window.YUA.ai.getResourceMindmap(targetResourceId);
      if (mindmapData && mindmapData.markdown) {
        setMarkdown(mindmapData.markdown);
        setProgress(100);
      }
    } catch (error) {
      console.error('加载脑图失败:', error);
    }
  }, [targetResourceId]);

  // 组件挂载时加载脑图
  useEffect(() => {
    if (!targetResourceId) return;

    const timer = window.setTimeout(() => {
      void loadMindmap();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadMindmap, targetResourceId]);

  // 使用 lodash throttle 创建节流的 setMarkdown 函数
  // 每 300ms 最多执行一次，保证流式生成过程中能看到渲染进度
  const throttledSetMarkdown = useMemo(
    () =>
      throttle(
        (newMarkdown: string) => {
          setMarkdown(newMarkdown);
        },
        300,
        { leading: true, trailing: true }
      ),
    []
  );

  // 清理 throttle
  useEffect(() => {
    return () => {
      throttledSetMarkdown.cancel();
    };
  }, [throttledSetMarkdown]);

  // 监听脑图事件
  useEffect(() => {
    const handler = (_: any, payload: any): void => {
      try {
        if (payload?.type === 'mindmap' && payload?.data) {
          const { type, data } = payload.data;

          if (type === 'connected') {
            setIsGenerating(true);
            setProgress(10);
          }

          if (type === 'progress' && data) {
            if (data.percentage !== undefined) {
              setProgress(data.percentage);
            }
            if (data.rawContent) {
              // 使用 lodash 节流函数，每 300ms 最多渲染一次
              throttledSetMarkdown(data.rawContent);
            }
          }

          if (type === 'completed' && data) {
            // 完成时取消节流并立即渲染最终结果
            throttledSetMarkdown.cancel();
            setMarkdown(data.markdown || '');
            setProgress(100);
            setIsGenerating(false);
            // 重新加载脑图以获取保存的版本
            void loadMindmap();
          }

          if (type === 'error') {
            console.error('生成脑图错误:', data?.message);
            setIsGenerating(false);
            setProgress(0);
          }

          if (type === 'done') {
            setIsGenerating(false);
            setCurrentRequestId(null);
          }
        }
      } catch (err) {
        console.warn('[MindmapTab] Failed to parse mindmap message:', err);
      }
    };

    window.ipcRenderer?.on('renderer-message', handler as any);
    return () => {
      window.ipcRenderer?.off('renderer-message', handler as any);
    };
  }, [throttledSetMarkdown, loadMindmap]);

  // 渲染 markmap
  useEffect(() => {
    if (!markdown || !svgRef.current) return;

    try {
      const transformer = new Transformer();
      const { root } = transformer.transform(markdown);

      if (!markmapRef.current) {
        markmapRef.current = Markmap.create(svgRef.current, {
          duration: 500,
          maxWidth: 300,
          initialExpandLevel: 3
        });
      }

      markmapRef.current.setData(root);
      markmapRef.current.fit();
    } catch (error) {
      console.error('[MindmapTab] 渲染脑图失败:', error);
    }
  }, [markdown]);

  const handleProviderConfigChange = useCallback((id: string, configured: boolean) => {
    setProviderConfigured(configured);
  }, []);

  const handleOpenConfig = useCallback(async (providerId: string, fields: string[], presetId?: string) => {
    await window.YUA.window['window:open']('aiProviderConfig' as any, { providerId, presetId, fields }, { sameDisplayAsSender: true });
  }, []);

  const handleGenerate = useCallback(async () => {
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

    setMarkdown('');
    setProgress(0);
    setIsGenerating(true);

    try {
      const { requestId } = await window.YUA.ai.generateMindmap({
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
      console.error('生成脑图失败:', error);
      setIsGenerating(false);
      setProgress(0);
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

  const handleStop = useCallback(async () => {
    if (currentRequestId) {
      await window.YUA.ai.cancelMindmap(currentRequestId);
      setCurrentRequestId(null);
    }
    setIsGenerating(false);
    setProgress(0);
  }, [currentRequestId]);

  useEffect(() => {
    savePreferences({
      selectedProviderId,
      selectedPresetId,
      selectedModel,
      targetLanguage
    });
  }, [selectedPresetId, selectedProviderId, selectedModel, targetLanguage]);

  // 检查是否是视频资源且没有字幕
  const isVideo = resource?.type === 'video';
  const hasNoSubtitle = isVideo && !activeSubtitle;

  if (!markdown && !isGenerating) {
    // 如果是视频但没有字幕，显示提示
    if (hasNoSubtitle) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-4">
          <TbSitemap className="w-12 h-12 opacity-50" />
          <p>无法生成脑图</p>
          <p className="text-xs">此视频暂无字幕文件，请先提取视频字幕</p>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-4">
        <TbSitemap className="w-12 h-12 opacity-50" />
        <p>暂无脑图数据</p>
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button>
              <TbSitemap />
              生成脑图
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-80">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">AI 模型</Label>
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
                  handleGenerate();
                }}
                disabled={!selectedProviderId || !selectedModel || !targetLanguage || !providerConfigured}
              >
                生成脑图
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
          {isGenerating ? (
            <Button size="icon" className="w-8 h-8" variant="ghost" onClick={handleStop}>
              <TbPlayerStop className="animate-pulse" />
            </Button>
          ) : (
            <>
              <Button
                size="icon"
                className="w-8 h-8"
                variant="ghost"
                onClick={() => {
                  void loadMindmap();
                }}
                title="刷新"
              >
                <TbRefresh />
              </Button>
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button size="icon" className="w-8 h-8" variant="ghost" disabled={hasNoSubtitle} title={hasNoSubtitle ? '请先提取视频字幕' : undefined}>
                    <TbSitemap />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">AI 模型</Label>
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
                        handleGenerate();
                      }}
                      disabled={!selectedProviderId || !selectedModel || !targetLanguage || !providerConfigured}
                    >
                      {markdown ? '重新生成' : '生成脑图'}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
          {isGenerating && <span className="text-xs text-muted-foreground font-mono">{progress}%</span>}
        </div>
      </div>

      {/* 脑图展示区域 */}
      <div className="flex-1 w-full h-full relative bg-background">
        <svg ref={svgRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default MindmapTab;
