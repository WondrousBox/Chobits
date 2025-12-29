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

  // 普通翻译相关状态
  const [selectedService, setSelectedService] = useState<TranslationService>('google');

  // 共用状态
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<string>('');
  const translationStreamRef = useRef<{ dispose: () => void; cancel: () => Promise<any> } | null>(null);

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

      // 构建翻译提示词
      const targetLangName = languageNames[targetLanguage] || targetLanguage;
      const segmentsText = validSegments.map((seg, idx) => `${idx + 1}. ${seg.text}`).join('\n');
      const prompt = `请将以下字幕翻译成${targetLangName}，保持原有的编号格式，只返回翻译结果，不要添加任何解释或说明。每个翻译结果占一行，格式为：编号. 翻译文本\n\n${segmentsText}`;

      let currentTranslation = '';

      const stream = await window.YUA.ai.chatStreamEphemeral(
        {
          messages: [{ role: 'user', content: prompt }],
          providerId: selectedProviderId,
          model: selectedModel,
          stream: true
        },
        (ev: any) => {
          if (ev.type === 'connected') {
            setTranslationProgress('正在连接AI服务...');
          } else if (ev.type === 'delta' && ev.data?.text) {
            currentTranslation += ev.data.text;
            setTranslationProgress('正在翻译...');
          } else if (ev.type === 'message_completed' && ev.data?.message?.content) {
            const translation = ev.data.message.content.trim();
            setTranslationProgress('翻译完成，正在更新字幕...');

            // 更新字幕内容
            try {
              // 解析翻译结果 - 支持多种格式
              const lines = translation.split('\n').filter((line: string) => line.trim());
              const translations: string[] = [];

              lines.forEach((line: string) => {
                // 尝试匹配格式：编号. 翻译文本 或 编号、翻译文本 或 编号 翻译文本
                const match = line.match(/^\d+[\.、\s]+\s*(.+)$/);
                if (match) {
                  translations.push(match[1].trim());
                } else if (line.trim()) {
                  // 如果没有编号，直接使用整行作为翻译
                  translations.push(line.trim());
                }
              });

              // 如果解析失败，尝试按行顺序直接使用
              if (translations.length === 0 && lines.length > 0) {
                translations.push(...lines.map((l) => l.trim()).filter(Boolean));
              }

              if (translations.length > 0) {
                const updated = [...subtitleEntries];
                let validIndex = 0;

                // 只更新有效的（未删除的）片段
                translations.forEach((translatedText, idx) => {
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
              console.error('解析翻译结果失败:', error);
              setTranslationProgress('翻译完成，但解析结果时出错');
            }

            setIsTranslating(false);
          } else if (ev.type === 'error') {
            console.error('翻译错误:', ev.data);
            setTranslationProgress('翻译失败');
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
  }, [selectedProviderId, selectedModel, targetLanguage, subtitleEntries, resourceId, isLoading, debouncedSave, onTranslateComplete]);

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
          <Button size="sm" variant="outline" className="h-8">
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

              <Button size="sm" className="w-full" onClick={handleAITranslate} disabled={!selectedProviderId || !selectedModel || !targetLanguage || isTranslating || subtitleEntries.length === 0}>
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
