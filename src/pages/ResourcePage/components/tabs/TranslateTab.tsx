import { AimSegments, parser } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbLanguage, TbPlayerStop, TbRefresh } from 'react-icons/tb';

import { ProviderModelSelect, ProviderModelSelectRef } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveModelFirstSelection } from '@/lib/ai-model-first';

import { useResourceTabContext } from './ResourceTabContext';

interface TranslationRecord {
  id: string;
  language?: string;
  title?: string;
  filePath?: string;
  segments?: Array<{ index: number; text: string }>;
  createdAt?: number;
  updatedAt?: number;
}

// 语言代码到中文名称的映射
const languageNames: Record<string, string> = {
  en: '英语',
  zh: '中文',
  'zh-CN': '简体中文',
  'zh-TW': '繁体中文',
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
  th: '泰语',
  tr: '土耳其语',
  nl: '荷兰语',
  pl: '波兰语',
  id: '印尼语',
  ms: '马来语'
};

const languageOptions = Object.entries(languageNames).map(([code, name]) => ({
  value: code,
  label: name
}));

/**
 * 获取语言的显示名称
 */
const getLanguageLabel = (code?: string): string => {
  if (!code) return '未知语言';
  return languageNames[code] || code;
};

const STORAGE_KEY = 'translate-tab-preferences';

const loadPreferences = (): Record<string, any> | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('读取翻译偏好设置失败:', error);
  }
  return null;
};

const savePreferences = (preferences: { selectedProviderId?: string; selectedPresetId?: string; selectedModel?: string; targetLanguage?: string }): void => {
  try {
    const existing = loadPreferences() || {};
    const updated = { ...existing, ...preferences };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('保存翻译偏好设置失败:', error);
  }
};

/**
 * 翻译 Tab 组件
 * 用于显示资源的所有翻译历史记录
 */
const TranslateTab: React.FC = () => {
  const { resource, activeSubtitle } = useResourceTabContext();
  const savedPreferences = loadPreferences();

  const [translations, setTranslations] = useState<TranslationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const [selectedProviderId, setSelectedProviderId] = useState<string>(savedPreferences?.selectedProviderId || '');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(savedPreferences?.selectedPresetId || '');
  const [selectedModel, setSelectedModel] = useState<string>(savedPreferences?.selectedModel || '');
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);
  const [targetLanguage, setTargetLanguage] = useState<string>(savedPreferences?.targetLanguage || 'zh');

  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);

  const providerSelectRef = useRef<ProviderModelSelectRef>(null);

  // 优先使用 activeSubtitle，如果没有则使用 resource
  const targetResource = activeSubtitle || resource;
  const targetResourceId = targetResource?.id;

  // 加载所有翻译历史（不筛选）
  const loadTranslations = useCallback(async (): Promise<void> => {
    if (!targetResourceId) return;

    setLoading(true);
    try {
      const result = await window.YUA.ai.getAllTranslationHistory(targetResourceId);
      setTranslations(result || []);
    } catch (error) {
      console.error('加载翻译历史失败:', error);
    } finally {
      setLoading(false);
    }
  }, [targetResourceId]);

  useEffect(() => {
    if (!targetResourceId) return;

    const timer = window.setTimeout(() => {
      void loadTranslations();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadTranslations, targetResourceId]);

  // 监听翻译事件
  useEffect(() => {
    const handler = (_: any, payload: any): void => {
      try {
        if (payload?.type === 'translate' && payload?.data) {
          const { type, data } = payload.data;

          if (type === 'connected') {
            setIsTranslating(true);
            setTranslationProgress(10);
          }

          if (type === 'progress' && data) {
            if (data.percentage !== undefined) {
              setTranslationProgress(data.percentage);
            }
          }

          if (type === 'completed') {
            setTranslationProgress(100);
            setIsTranslating(false);
            setCurrentRequestId(null);
            // 翻译完成后重新加载历史
            void loadTranslations();
          }

          if (type === 'error') {
            console.error('翻译错误:', data?.message);
            setIsTranslating(false);
            setTranslationProgress(0);
            setCurrentRequestId(null);
          }

          if (type === 'done') {
            setIsTranslating(false);
            setCurrentRequestId(null);
          }
        }
      } catch (err) {
        console.warn('[TranslateTab] Failed to parse translate message:', err);
      }
    };

    window.ipcRenderer?.on('renderer-message', handler as any);
    return () => {
      window.ipcRenderer?.off('renderer-message', handler as any);
    };
  }, [loadTranslations]);

  const handleProviderConfigChange = useCallback((id: string, configured: boolean) => {
    setProviderConfigured(configured);
  }, []);

  const handleOpenConfig = useCallback(async (providerId: string, fields: string[], presetId?: string) => {
    await window.YUA.window['window:open']('aiProviderConfig' as any, { providerId, presetId, fields }, { sameDisplayAsSender: true });
  }, []);

  const handleTranslate = useCallback(async () => {
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

    // 检查是否有字幕文件
    if (!targetResource?.filePath) {
      console.warn('[TranslateTab] 没有字幕文件');
      return;
    }

    // 读取字幕文件并解析
    try {
      const result: any = await window.YUA.file['file:readContent'](targetResource.filePath);
      if (!result.success || !result.content) {
        console.warn('[TranslateTab] 读取字幕文件失败');
        return;
      }

      const res = await parser.parseSubtitle(result.content || '');
      const segments: AimSegments[] = res?.segments || [];

      if (segments.length === 0) {
        console.warn('[TranslateTab] 字幕片段为空');
        return;
      }

      setIsTranslating(true);
      setTranslationProgress(0);

      const segmentsData = segments.map((seg, idx) => ({
        text: seg.text,
        st: seg.st,
        et: seg.et,
        index: idx
      }));

      const { requestId } = await window.YUA.ai.translate({
        providerId: resolvedSelection.providerId,
        providerPresetId: resolvedSelection.providerPresetId,
        model: resolvedSelection.modelId,
        segments: segmentsData,
        targetLanguage,
        languageNames,
        metadata: {
          resourceId: targetResource.id
        }
      });

      setCurrentRequestId(requestId);
    } catch (error) {
      console.error('翻译失败:', error);
      setIsTranslating(false);
      setTranslationProgress(0);
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

  const handleStopTranslation = useCallback(async () => {
    if (currentRequestId) {
      await window.YUA.ai.cancelTranslate(currentRequestId);
      setCurrentRequestId(null);
    }
    setIsTranslating(false);
    setTranslationProgress(0);
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
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">加载翻译数据中...</div>;
  }

  // 检查是否是视频资源且没有字幕
  const isVideo = resource?.type === 'video';
  const hasNoSubtitle = isVideo && !activeSubtitle;

  if (translations.length === 0 && !isTranslating) {
    // 如果是视频但没有字幕，显示提示
    if (hasNoSubtitle) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-4">
          <TbLanguage className="w-12 h-12 opacity-50" />
          <p>无法开始翻译</p>
          <p className="text-xs">此视频暂无字幕文件，请先提取视频字幕</p>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-4">
        <TbLanguage className="w-12 h-12 opacity-50" />
        <p>暂无翻译记录</p>
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button>
              <TbLanguage />
              开始翻译
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-80">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">翻译模型</Label>
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
                  handleTranslate();
                }}
                disabled={!selectedProviderId || !selectedModel || !targetLanguage || !providerConfigured}
              >
                开始翻译
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
        <div className="flex items-center gap-2">
          <TbLanguage className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">翻译历史</span>
          <span className="text-xs text-muted-foreground">({translations.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {isTranslating ? (
            <Button size="icon" className="w-8 h-8" variant="ghost" onClick={handleStopTranslation}>
              <TbPlayerStop className="animate-pulse" />
            </Button>
          ) : (
            <>
              <Button size="icon" className="w-8 h-8" variant="ghost" onClick={loadTranslations}>
                <TbRefresh />
              </Button>
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button size="icon" className="w-8 h-8" variant="ghost" disabled={hasNoSubtitle} title={hasNoSubtitle ? '请先提取视频字幕' : undefined}>
                    <TbLanguage />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">翻译模型</Label>
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
                        handleTranslate();
                      }}
                      disabled={!selectedProviderId || !selectedModel || !targetLanguage || !providerConfigured}
                    >
                      开始翻译
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
          {isTranslating && <span className="text-xs text-muted-foreground font-mono">{translationProgress}%</span>}
        </div>
      </div>

      {/* 翻译列表 */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {translations.map((trans) => (
            <div key={trans.id} className="border rounded-lg p-2 hover:bg-accent/50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 flex items-center justify-between">
                  {/* 标题和语言 */}
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{getLanguageLabel(trans.language)}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{trans.segments?.length || 0} 个片段</span>
                  </div>

                  {/* 时间信息 */}
                  {trans.updatedAt && (
                    <div className="text-xs text-muted-foreground">
                      {new Date(trans.updatedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default TranslateTab;
