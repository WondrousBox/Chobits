import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbBrain, TbCheck, TbChevronDown, TbLanguage, TbListDetails, TbLoader2, TbSparkles, TbVocabulary, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { RecognizedSegment } from '../types';

interface AIActionsPanelProps {
  segments: RecognizedSegment[];
  isTransparent?: boolean;
  onTranslationUpdate?: (segmentIndex: number, translation: string) => void;
}

export interface TranslationConfig {
  providerId: string;
  targetLanguage: string;
}

// 目标语言选项
const TARGET_LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'de', label: '德语' },
  { value: 'es', label: '西班牙语' },
  { value: 'ru', label: '俄语' },
  { value: 'fr', label: '法语' }
];

export const AIActionsPanel: React.FC<AIActionsPanelProps> = ({ segments, isTransparent = false, onTranslationUpdate }) => {
  // AI 配置状态
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [showProviderConfig, setShowProviderConfig] = useState(true); // 是否显示服务配置表单

  // 翻译状态
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('zh');
  const [showLanguageSelect, setShowLanguageSelect] = useState(false); // 是否显示语言选择
  const [isTranslating, setIsTranslating] = useState(false);
  const translatingRef = useRef(false);
  const translationAbortRef = useRef(false);

  // 功能状态
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [result, setResult] = useState('');
  const [resultType, setResultType] = useState<string>('');

  // 获取所有文本
  const allText = segments.map((s) => s.text).join(' ');

  // 获取当前选择的服务商名称
  const getProviderLabel = useCallback(() => {
    const provider = providers.find((p) => p.id === selectedProviderId);
    return provider?.label || provider?.id || '未选择';
  }, [providers, selectedProviderId]);

  // 加载 AI Providers
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingProviders(true);
        const provs = await window.YUA.ai.getProviders();
        if (!mounted) return;
        setProviders(provs || []);
        if (provs && provs.length > 0) {
          setSelectedProviderId((prev) => prev || provs[0].id);
        }
      } catch (error) {
        console.error('加载 AI Providers 失败:', error);
      } finally {
        if (mounted) setLoadingProviders(false);
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

        const schema = provider.schema;
        const requiredFields = schema?.fields?.filter((f: any) => f.required) || [];

        if (requiredFields.length === 0) {
          setProviderConfigured(true);
          return true;
        }

        const secrets = await window.YUA.ai.getProviderSecrets(providerId).catch(() => ({}));
        const allConfigured = requiredFields.every((f: any) => {
          const value = (secrets as Record<string, string>)[f.key];
          return value && value.trim().length > 0;
        });

        setProviderConfigured(allConfigured);
        // 如果已配置，自动收起配置表单
        if (allConfigured) {
          setShowProviderConfig(false);
        }
        return allConfigured;
      } catch (error) {
        console.error('检测Provider配置失败:', error);
        setProviderConfigured(false);
        return false;
      }
    },
    [providers]
  );

  // 当选择provider或providers变化时，检测配置
  useEffect(() => {
    if (selectedProviderId && providers.length > 0) {
      checkProviderConfig(selectedProviderId);
    } else {
      setProviderConfigured(false);
    }
  }, [selectedProviderId, providers, checkProviderConfig]);

  // 监听窗口focus事件，重新检测配置
  useEffect(() => {
    const handleFocus = (): void => {
      if (selectedProviderId) {
        checkProviderConfig(selectedProviderId);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedProviderId, checkProviderConfig]);

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

  // 翻译单个segment
  const translateSegment = useCallback(
    async (text: string): Promise<string> => {
      const languageNames: Record<string, string> = {
        en: '英语',
        zh: '中文',
        ja: '日语',
        ko: '韩语',
        de: '德语',
        es: '西班牙语',
        ru: '俄语',
        fr: '法语'
      };

      const targetLangName = languageNames[targetLanguage] || targetLanguage;
      const prompt = `请将以下文本翻译成${targetLangName}，只返回翻译结果，不要添加任何解释或说明：\n\n${text}`;

      return new Promise((resolve, reject) => {
        let result = '';
        window.YUA.ai
          .chatStreamEphemeral(
            {
              messages: [{ role: 'user', content: prompt }],
              providerId: selectedProviderId,
              stream: true
            },
            (ev: any) => {
              if (ev.type === 'delta' && ev.data?.text) {
                result += ev.data.text;
              } else if (ev.type === 'message_completed' && ev.data?.message?.content) {
                result = ev.data.message.content.trim();
              } else if (ev.type === 'done') {
                resolve(result);
              } else if (ev.type === 'error') {
                reject(new Error(ev.data?.message || '翻译失败'));
              }
            }
          )
          .catch(reject);
      });
    },
    [selectedProviderId, targetLanguage]
  );

  // 顺序翻译所有未翻译的segments
  const translateAllSegments = useCallback(async () => {
    if (translatingRef.current || !providerConfigured) return;

    translatingRef.current = true;
    translationAbortRef.current = false;
    setIsTranslating(true);

    try {
      for (let i = 0; i < segments.length; i++) {
        if (translationAbortRef.current) break;

        const segment = segments[i];
        // 跳过已翻译的
        if (segment.translation) continue;

        try {
          const translation = await translateSegment(segment.text);
          if (!translationAbortRef.current && onTranslationUpdate) {
            onTranslationUpdate(i, translation);
          }
        } catch (error) {
          console.error(`翻译第 ${i + 1} 条失败:`, error);
        }
      }
    } finally {
      translatingRef.current = false;
      setIsTranslating(false);
    }
  }, [segments, providerConfigured, translateSegment, onTranslationUpdate]);

  // 监听segments变化，继续翻译新增的
  useEffect(() => {
    if (enableTranslation && providerConfigured && !translatingRef.current) {
      // 检查是否有未翻译的
      const hasUntranslated = segments.some((s) => !s.translation);
      if (hasUntranslated) {
        translateAllSegments();
      }
    }
  }, [segments, enableTranslation, providerConfigured, translateAllSegments]);

  // 点击翻译按钮
  const handleTranslationClick = useCallback(() => {
    if (enableTranslation) {
      // 已开启，点击关闭
      setEnableTranslation(false);
      translationAbortRef.current = true;
      setShowLanguageSelect(false);
    } else {
      // 未开启，显示语言选择
      setShowLanguageSelect(true);
    }
  }, [enableTranslation]);

  // 确认开启翻译
  const handleConfirmTranslation = useCallback(() => {
    setShowLanguageSelect(false);
    setEnableTranslation(true);
    // 开始翻译
    translateAllSegments();
  }, [translateAllSegments]);

  // 取消语言选择
  const handleCancelLanguageSelect = useCallback(() => {
    setShowLanguageSelect(false);
  }, []);

  // AI操作：总结
  const handleSummarize = async (): Promise<void> => {
    if (!allText || !providerConfigured) return;
    setIsProcessing('summarize');
    setResult('');
    setResultType('summarize');

    try {
      const prompt = `请对以下语音识别内容进行简洁的总结，突出主要内容和关键信息：\n\n${allText}`;

      let currentResult = '';
      await window.YUA.ai.chatStreamEphemeral(
        {
          messages: [{ role: 'user', content: prompt }],
          providerId: selectedProviderId,
          stream: true
        },
        (ev: any) => {
          if (ev.type === 'delta' && ev.data?.text) {
            currentResult += ev.data.text;
            setResult(currentResult);
          } else if (ev.type === 'message_completed' && ev.data?.message?.content) {
            setResult(ev.data.message.content.trim());
          } else if (ev.type === 'done' || ev.type === 'error') {
            setIsProcessing(null);
          }
        }
      );
    } catch (error) {
      console.error('总结失败:', error);
      setResult('总结失败，请重试');
      setIsProcessing(null);
    }
  };

  // AI操作：提取单词表
  const handleExtractVocabulary = async (): Promise<void> => {
    if (!allText || !providerConfigured) return;
    setIsProcessing('vocabulary');
    setResult('');
    setResultType('vocabulary');

    try {
      const prompt = `请从以下语音识别内容中提取重要的词汇和专业术语，以列表形式展示，每个词汇附带简短解释：\n\n${allText}`;

      let currentResult = '';
      await window.YUA.ai.chatStreamEphemeral(
        {
          messages: [{ role: 'user', content: prompt }],
          providerId: selectedProviderId,
          stream: true
        },
        (ev: any) => {
          if (ev.type === 'delta' && ev.data?.text) {
            currentResult += ev.data.text;
            setResult(currentResult);
          } else if (ev.type === 'message_completed' && ev.data?.message?.content) {
            setResult(ev.data.message.content.trim());
          } else if (ev.type === 'done' || ev.type === 'error') {
            setIsProcessing(null);
          }
        }
      );
    } catch (error) {
      console.error('提取词汇失败:', error);
      setResult('提取词汇失败，请重试');
      setIsProcessing(null);
    }
  };

  // AI操作：高光内容
  const handleHighlights = async (): Promise<void> => {
    if (!allText || !providerConfigured) return;
    setIsProcessing('highlights');
    setResult('');
    setResultType('highlights');

    try {
      const prompt = `请从以下语音识别内容中提取最重要、最精彩或最值得关注的内容片段，并简要说明为什么这些内容值得关注：\n\n${allText}`;

      let currentResult = '';
      await window.YUA.ai.chatStreamEphemeral(
        {
          messages: [{ role: 'user', content: prompt }],
          providerId: selectedProviderId,
          stream: true
        },
        (ev: any) => {
          if (ev.type === 'delta' && ev.data?.text) {
            currentResult += ev.data.text;
            setResult(currentResult);
          } else if (ev.type === 'message_completed' && ev.data?.message?.content) {
            setResult(ev.data.message.content.trim());
          } else if (ev.type === 'done' || ev.type === 'error') {
            setIsProcessing(null);
          }
        }
      );
    } catch (error) {
      console.error('提取高光内容失败:', error);
      setResult('提取高光内容失败，请重试');
      setIsProcessing(null);
    }
  };

  // 获取结果标题
  const getResultTitle = (): string => {
    switch (resultType) {
      case 'summarize':
        return '内容总结';
      case 'vocabulary':
        return '词汇表';
      case 'highlights':
        return '高光内容';
      default:
        return '结果';
    }
  };

  // 获取翻译进度
  const getTranslationProgress = useCallback(() => {
    if (!enableTranslation) return null;
    const total = segments.length;
    const translated = segments.filter((s) => s.translation).length;
    return { total, translated };
  }, [segments, enableTranslation]);

  const translationProgress = getTranslationProgress();

  return (
    <div className="flex flex-col h-full border-l bg-background no-drag">
      {/* 头部：AI服务配置 */}
      <div className={`px-3 py-2 border-b ${isTransparent ? 'border-border/50' : ''}`}>
        {loadingProviders ? (
          <div className="flex items-center justify-center py-2">
            <TbLoader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : showProviderConfig ? (
          // 展开的配置表单
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium flex items-center gap-1">
                <TbBrain className="h-3.5 w-3.5" />
                AI 服务
              </Label>
              {providerConfigured && (
                <Button size="sm" variant="ghost" className="h-5 text-xs px-1" onClick={() => setShowProviderConfig(false)}>
                  收起
                </Button>
              )}
            </div>
            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择 AI 服务商" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id} className="text-xs">
                    {provider.label || provider.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProviderId && !providerConfigured && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <span>需要配置 API Key</span>
                <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={handleOpenProviderConfig}>
                  去配置
                </Button>
              </div>
            )}
            {selectedProviderId && providerConfigured && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <TbCheck className="h-3.5 w-3.5" />
                <span>已配置</span>
              </div>
            )}
          </div>
        ) : (
          // 折叠状态：显示当前服务按钮
          <Button variant="ghost" size="sm" className="w-full h-7 justify-between text-xs" onClick={() => setShowProviderConfig(true)}>
            <span className="flex items-center gap-1">
              <TbBrain className="h-3.5 w-3.5" />
              {getProviderLabel()}
            </span>
            <TbChevronDown className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* 内容区域：结果展示 */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {result ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">{getResultTitle()}</Label>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs px-2"
                    onClick={() => {
                      navigator.clipboard.writeText(result);
                    }}
                  >
                    复制
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setResult('')}>
                    <TbX className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className={`p-3 rounded-lg border text-sm whitespace-pre-wrap ${isTransparent ? 'border-border/50 bg-background/50' : 'bg-muted/50'}`}>{result}</div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">{allText ? '点击下方按钮使用 AI 功能' : '等待语音识别内容...'}</div>
          )}
        </div>
      </ScrollArea>

      {/* 底部：功能按钮 */}
      <div className={`px-3 py-2 border-t space-y-2 ${isTransparent ? 'border-border/50' : ''}`}>
        {/* 翻译语言选择（仅在选择时显示） */}
        {showLanguageSelect && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
            <Select value={targetLanguage} onValueChange={setTargetLanguage}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="选择目标语言" />
              </SelectTrigger>
              <SelectContent>
                {TARGET_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value} className="text-xs">
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-7 text-xs" onClick={handleConfirmTranslation}>
              确定
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleCancelLanguageSelect}>
              <TbX className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* 功能按钮行 */}
        <div className="flex items-center gap-1">
          {/* 翻译按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant={enableTranslation ? 'default' : 'outline'} className="h-8 w-8" onClick={handleTranslationClick} disabled={!providerConfigured || isProcessing !== null}>
                {isTranslating ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbLanguage className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{enableTranslation ? (translationProgress ? `翻译中 ${translationProgress.translated}/${translationProgress.total}` : '翻译中...') : '翻译'}</TooltipContent>
          </Tooltip>

          {/* 总结按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleSummarize} disabled={!providerConfigured || !allText || isProcessing !== null}>
                {isProcessing === 'summarize' ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbSparkles className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>总结</TooltipContent>
          </Tooltip>

          {/* 词汇按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleExtractVocabulary} disabled={!providerConfigured || !allText || isProcessing !== null}>
                {isProcessing === 'vocabulary' ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbVocabulary className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>词汇</TooltipContent>
          </Tooltip>

          {/* 高光按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleHighlights} disabled={!providerConfigured || !allText || isProcessing !== null}>
                {isProcessing === 'highlights' ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbListDetails className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>高光</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
