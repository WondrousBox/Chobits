import { AimSegments } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbLanguage } from 'react-icons/tb';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// 语言代码到中文名称的映射
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

interface SubtitleTranslatorProps {
  subtitleEntries: AimSegments[];
  onTranslateComplete: (updatedSegments: AimSegments[]) => void;
  resourceId: string;
  isLoading: boolean;
  debouncedSave: (resourceId: string, segments: AimSegments[]) => void;
}

// 翻译服务类型
type TranslationService = 'google' | 'microsoft' | 'deepl';

const translationServices: { value: TranslationService; label: string }[] = [
  { value: 'google', label: 'Google 翻译' },
  { value: 'microsoft', label: '微软翻译' },
  { value: 'deepl', label: 'DeepL' }
];

export const SubtitleTranslator: React.FC<SubtitleTranslatorProps> = ({ subtitleEntries, onTranslateComplete, resourceId, isLoading, debouncedSave }) => {
  const [isTranslationPopoverOpen, setIsTranslationPopoverOpen] = useState(false);
  const [translationMode, setTranslationMode] = useState<'ai' | 'normal'>('ai');

  // AI 翻译相关状态
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [providers, setProviders] = useState<any[]>([]);
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);

  // 普通翻译相关状态
  const [selectedService, setSelectedService] = useState<TranslationService>('google');

  // 共用状态
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<string>('');
  const translationStreamRef = useRef<{ dispose: () => void; cancel: () => Promise<any> } | null>(null);

  // 加载 AI Providers
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const provs = await window.YUA.ai.getProviders();
        if (!mounted) return;
        setProviders(provs || []);
      } catch (error) {
        console.error('加载 AI Providers 失败:', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 检测Provider配置状态
  const checkProviderConfig = useCallback(
    async (providerId: string): Promise<boolean> => {
      if (!providerId) {
        setProviderConfigured(false);
        return false;
      }

      try {
        const provider = providers.find((p) => p.id === providerId);
        if (!provider) {
          setProviderConfigured(false);
          return false;
        }

        // 获取provider的schema，检查required字段
        const schema = provider.schema;
        const requiredFields = schema?.fields?.filter((f: any) => f.required) || [];

        if (requiredFields.length === 0) {
          // 如果没有required字段，认为已配置
          setProviderConfigured(true);
          return true;
        }

        // 获取已配置的secrets
        const secrets = await window.YUA.ai.getProviderSecrets(providerId).catch(() => ({}));

        // 检查所有required字段是否都有值
        const allConfigured = requiredFields.every((f: any) => {
          const value = secrets[f.key];
          return value && (typeof value === 'string' ? value.trim().length > 0 : true);
        });

        setProviderConfigured(allConfigured);
        return allConfigured;
      } catch (error) {
        console.error('检测Provider配置失败:', error);
        setProviderConfigured(false);
        return false;
      }
    },
    [providers]
  );

  // 打开配置窗口
  const handleOpenProviderConfig = useCallback(async () => {
    if (!selectedProviderId) return;

    try {
      const provider = providers.find((p) => p.id === selectedProviderId);
      if (!provider) return;

      const schema = provider.schema;
      const requiredFields = schema?.fields?.filter((f: any) => f.required) || [];
      const fields = requiredFields.map((f: any) => f.key);

      await window.YUA.window['window:open']('aiProviderConfig' as any, { providerId: selectedProviderId, fields }, { sameDisplayAsSender: true });
    } catch (error) {
      console.error('打开配置窗口失败:', error);
    }
  }, [selectedProviderId, providers]);

  // 当选择provider或providers变化时，检测配置
  useEffect(() => {
    if (translationMode === 'ai' && selectedProviderId && providers.length > 0) {
      checkProviderConfig(selectedProviderId);
    } else {
      setProviderConfigured(false);
    }
  }, [selectedProviderId, translationMode, providers, checkProviderConfig]);

  // 监听配置窗口关闭事件，重新检测配置
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    // 如果选择了provider且未配置，定期检测配置状态（用于检测配置窗口关闭后的状态）
    if (translationMode === 'ai' && selectedProviderId && !providerConfigured) {
      intervalId = setInterval(() => {
        checkProviderConfig(selectedProviderId);
      }, 2000); // 每2秒检测一次
    }

    // 监听窗口focus事件，当窗口重新获得焦点时检测配置
    const handleFocus = (): void => {
      if (translationMode === 'ai' && selectedProviderId) {
        checkProviderConfig(selectedProviderId);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [translationMode, selectedProviderId, providerConfigured, checkProviderConfig]);

  // 处理服务商和模型的选择
  const handleProviderModelChange = useCallback((providerId: string, modelId: string) => {
    setSelectedProviderId(providerId);
    setSelectedModel(modelId);
  }, []);

  // 清理翻译流
  useEffect(() => {
    return () => {
      if (translationStreamRef.current) {
        translationStreamRef.current.dispose();
        translationStreamRef.current = null;
      }
    };
  }, []);

  // AI 翻译功能
  const handleAITranslate = useCallback(async () => {
    if (!selectedProviderId || !selectedModel || !targetLanguage || subtitleEntries.length === 0) {
      return;
    }

    // 检查API配置
    const isConfigured = await checkProviderConfig(selectedProviderId);
    if (!isConfigured) {
      handleOpenProviderConfig();
      return;
    }

    // 过滤掉已删除的片段
    const validSegments = subtitleEntries.filter((seg) => !seg.delete);
    if (validSegments.length === 0) {
      return;
    }

    const validSegmentsLength = validSegments.length;

    setIsTranslating(true);
    setTranslationProgress('准备翻译...');

    try {
      // 取消之前的翻译请求
      if (translationStreamRef.current) {
        try {
          await translationStreamRef.current.cancel();
          translationStreamRef.current.dispose();
        } catch (error) {
          console.error('取消翻译失败:', error);
        }
        translationStreamRef.current = null;
      }

      // 生成请求 ID
      const requestId = `translate-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // 准备翻译数据
      const segmentsData = validSegments.map((seg, idx) => ({
        text: seg.text,
        index: idx
      }));

      // 调用主进程的翻译功能
      const stream = await window.YUA.ai.translate(
        {
          requestId,
          providerId: selectedProviderId,
          model: selectedModel,
          segments: segmentsData,
          targetLanguage,
          languageNames
        },
        (ev: any) => {
          if (ev.type === 'connected') {
            setTranslationProgress('正在连接AI服务...');
          } else if (ev.type === 'progress') {
            if (ev.data?.message) {
              setTranslationProgress(ev.data.message);
            }
          } else if (ev.type === 'completed' && ev.data?.translations) {
            const translations = ev.data.translations;
            setTranslationProgress('翻译完成，正在更新字幕...');

            // 更新字幕内容
            try {
              if (translations.length > 0) {
                const updated = [...subtitleEntries];
                let validIndex = 0;

                // 只更新有效的（未删除的）片段
                translations.forEach((translatedText: string, idx: number) => {
                  // 找到下一个有效片段
                  while (validIndex < updated.length && updated[validIndex].delete) {
                    validIndex++;
                  }

                  if (validIndex < updated.length && idx < validSegmentsLength) {
                    updated[validIndex] = {
                      ...updated[validIndex],
                      text: translatedText
                    };
                    validIndex++;
                  }
                });

                // 通知父组件更新
                onTranslateComplete(updated);

                // 触发保存
                if (resourceId && !isLoading) {
                  debouncedSave(resourceId, updated);
                }
              }

              setTranslationProgress('翻译完成');
            } catch (error) {
              console.error('更新字幕失败:', error);
              setTranslationProgress('翻译完成，但更新字幕时出错');
            }

            setIsTranslating(false);
          } else if (ev.type === 'error') {
            console.error('翻译错误:', ev.data);
            setTranslationProgress(ev.data?.message || '翻译失败');
            setIsTranslating(false);
          } else if (ev.type === 'done') {
            if (translationStreamRef.current) {
              translationStreamRef.current.dispose();
              translationStreamRef.current = null;
            }
            setIsTranslating(false);
          }
        }
      );

      translationStreamRef.current = stream;
    } catch (error) {
      console.error('翻译失败:', error);
      setTranslationProgress('翻译失败');
      setIsTranslating(false);
    }
  }, [selectedProviderId, selectedModel, targetLanguage, subtitleEntries, resourceId, isLoading, debouncedSave, onTranslateComplete, checkProviderConfig, handleOpenProviderConfig]);

  // 普通翻译功能
  const handleNormalTranslate = useCallback(async () => {
    if (!selectedService || !targetLanguage || subtitleEntries.length === 0) {
      return;
    }

    // 过滤掉已删除的片段
    const validSegments = subtitleEntries.filter((seg) => !seg.delete);
    if (validSegments.length === 0) {
      return;
    }

    setIsTranslating(true);
    setTranslationProgress('准备翻译...');

    try {
      // TODO: 实现实际的翻译服务 API 调用
      // 这里先创建一个占位实现
      setTranslationProgress('正在翻译...');

      // 模拟翻译过程
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 这里应该调用实际的翻译服务 API
      // 例如：await window.YUA.translation.translate({ service: selectedService, text: ..., targetLanguage: ... })

      // 临时占位：直接使用原文（实际应该调用翻译 API）
      const updated = [...subtitleEntries];

      // 通知父组件更新
      onTranslateComplete(updated);

      // 触发保存
      if (resourceId && !isLoading) {
        debouncedSave(resourceId, updated);
      }

      setTranslationProgress('翻译完成');
      setIsTranslating(false);
    } catch (error) {
      console.error('翻译失败:', error);
      setTranslationProgress('翻译失败');
      setIsTranslating(false);
    }
  }, [selectedService, targetLanguage, subtitleEntries, resourceId, isLoading, debouncedSave, onTranslateComplete]);

  return (
    <div className="flex items-center justify-end gap-2 px-4 py-2 border-b">
      <Popover open={isTranslationPopoverOpen} onOpenChange={setIsTranslationPopoverOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <TbLanguage />
            翻译
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <Tabs value={translationMode} onValueChange={(value) => setTranslationMode(value as 'ai' | 'normal')} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="ai">AI 翻译</TabsTrigger>
              <TabsTrigger value="normal">普通翻译</TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label className="text-sm font-medium">翻译服务商 · 模型</Label>
                <ProviderModelSelect
                  providerId={selectedProviderId}
                  modelId={selectedModel}
                  onChange={handleProviderModelChange}
                  placeholder="选择服务商 · 模型"
                  buttonVariant="outline"
                  buttonSize="sm"
                  className="w-full justify-between"
                  autoLoadFirst={true}
                  modelTypes={['chat']}
                  showModelDetails
                />
                {selectedProviderId && !providerConfigured && (
                  <div className="flex items-center justify-between p-2 text-xs bg-yellow-50 border border-yellow-200 rounded-md">
                    <span className="text-yellow-800">API 配置未完成</span>
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleOpenProviderConfig}>
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
                size="sm"
                className="w-full"
                onClick={handleAITranslate}
                disabled={!selectedProviderId || !selectedModel || !targetLanguage || isTranslating || subtitleEntries.length === 0 || !providerConfigured}
              >
                {isTranslating ? (
                  <>
                    <span className="mr-2">{translationProgress}</span>
                    <span className="animate-spin">⏳</span>
                  </>
                ) : (
                  '开始翻译'
                )}
              </Button>

              {translationProgress && !isTranslating && <div className="text-xs text-muted-foreground">{translationProgress}</div>}
            </TabsContent>

            <TabsContent value="normal" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label className="text-sm font-medium">翻译服务</Label>
                <Select value={selectedService} onValueChange={(value) => setSelectedService(value as TranslationService)}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择翻译服务" />
                  </SelectTrigger>
                  <SelectContent>
                    {translationServices.map((service) => (
                      <SelectItem key={service.value} value={service.value}>
                        {service.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

              <Button size="sm" className="w-full" onClick={handleNormalTranslate} disabled={!selectedService || !targetLanguage || isTranslating || subtitleEntries.length === 0}>
                {isTranslating ? (
                  <>
                    <span className="mr-2">{translationProgress}</span>
                    <span className="animate-spin">⏳</span>
                  </>
                ) : (
                  '开始翻译'
                )}
              </Button>

              {translationProgress && !isTranslating && <div className="text-xs text-muted-foreground">{translationProgress}</div>}
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </div>
  );
};
