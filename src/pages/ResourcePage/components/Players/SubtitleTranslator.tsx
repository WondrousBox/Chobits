import { AimSegments } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useState } from 'react';
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

// localStorage 键名
const STORAGE_KEY = 'subtitle-translator-preferences';

// 从 localStorage 读取保存的偏好设置
const loadPreferences = () => {
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

// 保存偏好设置到 localStorage
const savePreferences = (preferences: { translationMode?: 'ai' | 'normal'; selectedProviderId?: string; selectedModel?: string; selectedService?: TranslationService; targetLanguage?: string }) => {
  try {
    const existing = loadPreferences() || {};
    const updated = { ...existing, ...preferences };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('保存翻译偏好设置失败:', error);
  }
};

export const SubtitleTranslator: React.FC<SubtitleTranslatorProps> = ({ subtitleEntries, onTranslateComplete, resourceId, isLoading, debouncedSave }) => {
  // 从 localStorage 加载保存的偏好设置
  const savedPreferences = loadPreferences();

  const [isTranslationPopoverOpen, setIsTranslationPopoverOpen] = useState(false);
  const [translationMode, setTranslationMode] = useState<'ai' | 'normal'>(savedPreferences?.translationMode || 'ai');

  // AI 翻译相关状态
  const [selectedProviderId, setSelectedProviderId] = useState<string>(savedPreferences?.selectedProviderId || '');
  const [selectedModel, setSelectedModel] = useState<string>(savedPreferences?.selectedModel || '');
  const [providers, setProviders] = useState<any[]>([]);
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);

  // 普通翻译相关状态
  const [selectedService, setSelectedService] = useState<TranslationService>(savedPreferences?.selectedService || 'google');

  // 共用状态
  const [targetLanguage, setTargetLanguage] = useState<string>(savedPreferences?.targetLanguage || 'en');
  const [isTranslating, setIsTranslating] = useState(false);

  // 保存偏好设置到 localStorage
  useEffect(() => {
    savePreferences({
      translationMode,
      selectedProviderId,
      selectedModel,
      selectedService,
      targetLanguage
    });
  }, [translationMode, selectedProviderId, selectedModel, selectedService, targetLanguage]);

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

    setIsTranslationPopoverOpen(false);
    setIsTranslating(true);

    try {
      // 生成请求 ID
      const requestId = `translate-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // 准备翻译数据
      const segmentsData = validSegments.map((seg, idx) => ({
        text: seg.text,
        index: idx
      }));

      // 调用主进程的翻译功能（事件会通过 renderer-message 发送到所有窗口）
      await window.YUA.ai.translate({
        requestId,
        providerId: selectedProviderId,
        model: selectedModel,
        segments: segmentsData,
        targetLanguage,
        languageNames
      });
    } catch (error) {
      console.error('翻译失败:', error);
      setIsTranslating(false);
    }
  }, [selectedProviderId, selectedModel, targetLanguage, subtitleEntries, checkProviderConfig, handleOpenProviderConfig]);

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

    setIsTranslationPopoverOpen(false);
    setIsTranslating(true);

    try {
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

      setIsTranslating(false);
    } catch (error) {
      console.error('翻译失败:', error);
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
                className="w-full"
                onClick={handleAITranslate}
                disabled={!selectedProviderId || !selectedModel || !targetLanguage || isTranslating || subtitleEntries.length === 0 || !providerConfigured}
              >
                开始翻译
              </Button>
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
                开始翻译
              </Button>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </div>
  );
};
