import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbBrain, TbCheck, TbChevronDown, TbLanguage, TbListDetails, TbLoader2, TbSparkles, TbVocabulary, TbX } from 'react-icons/tb';

import { ProviderModelSelect, ProviderModelSelectRef } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { resolveModelFirstSelection } from '@/lib/ai-model-first';

import { RecognizedSegment } from '../types';

interface AIActionsPanelProps {
  segments: RecognizedSegment[];
  isSubtitleMode?: boolean;
  onTranslationUpdate?: (segmentIndex: number, translation: string) => void;
}

export interface TranslationConfig {
  providerId: string;
  presetId?: string;
  modelId?: string;
  targetLanguage: string;
}

const STORAGE_KEY = 'recording-ai-actions-preferences';

const loadPreferences = (): { selectedProviderId?: string; selectedPresetId?: string; selectedModelId?: string } => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('读取录音页 AI 预设失败:', error);
  }
  return {};
};

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

export const AIActionsPanel: React.FC<AIActionsPanelProps> = ({ segments, isSubtitleMode = false, onTranslationUpdate }) => {
  // AI 配置状态
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => loadPreferences().selectedProviderId || '');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => loadPreferences().selectedPresetId || '');
  const [selectedModel, setSelectedModel] = useState<string>(() => loadPreferences().selectedModelId || '');
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);
  const [isProviderConfigVisible, setIsProviderConfigVisible] = useState(true); // 是否显示服务配置表单
  const providerSelectRef = useRef<ProviderModelSelectRef>(null);

  // 翻译状态
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('zh');
  const [isLanguageSelectVisible, setIsLanguageSelectVisible] = useState(false); // 是否显示语言选择
  const [isTranslating, setIsTranslating] = useState(false);
  const translatingRef = useRef(false);
  const translationAbortRef = useRef(false);

  // 翻译结果里的高级词汇（去重）
  const [advancedWords, setAdvancedWords] = useState<string[]>([]);

  // 词汇解释状态
  const [vocabularyEnabled, setVocabularyEnabled] = useState(false);
  const [explainedWords, setExplainedWords] = useState<Set<string>>(new Set());
  const [isExplainingVocabulary, setIsExplainingVocabulary] = useState(false);
  const vocabularyAbortRef = useRef(false);
  const explainingRef = useRef(false);

  // AI消息气泡数据结构
  interface AIMessage {
    id: string;
    type: 'vocabulary' | 'summarize' | 'highlights';
    content: string;
    word?: string; // 仅用于词汇解释
    timestamp: number;
    isStreaming?: boolean;
  }
  const [messages, setMessages] = useState<AIMessage[]>([]);

  // 功能状态
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // 获取所有文本
  const allText = segments.map((s) => s.text).join(' ');
  const canUseAI = !!selectedProviderId && !!selectedModel && providerConfigured;
  const getSelectionLabel = useCallback(() => {
    if (selectedModel) return selectedModel;
    if (selectedProviderId) return selectedProviderId;
    return '未选择';
  }, [selectedModel, selectedProviderId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          selectedProviderId,
          selectedPresetId,
          selectedModelId: selectedModel
        })
      );
    } catch (error) {
      console.error('保存录音页 AI 预设失败:', error);
    }
  }, [selectedModel, selectedPresetId, selectedProviderId]);

  // 监听窗口focus事件，重新检测配置
  useEffect(() => {
    const handleFocus = (): void => {
      if (selectedProviderId) {
        void providerSelectRef.current?.checkConfig(selectedProviderId, selectedPresetId).then((configured) => {
          setProviderConfigured(!!configured);
          if (configured) {
            setIsProviderConfigVisible(false);
          }
        });
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedPresetId, selectedProviderId]);

  // 打开配置窗口
  const handleOpenProviderConfig = useCallback(async () => {
    try {
      if (!selectedProviderId) {
        await window.chobits.window['window:open']('settings' as any, { category: 'ai' });
        return;
      }
      providerSelectRef.current?.openConfig(selectedProviderId, selectedPresetId);
    } catch (error) {
      console.error('打开配置窗口失败:', error);
    }
  }, [selectedPresetId, selectedProviderId]);

  const resolveActiveSelection = useCallback(async () => {
    if (!selectedProviderId || !selectedModel) {
      return null;
    }

    const isConfigured = await providerSelectRef.current?.checkConfig(selectedProviderId, selectedPresetId);
    if (!isConfigured) {
      providerSelectRef.current?.openConfig(selectedProviderId, selectedPresetId);
      return null;
    }

    const resolvedSelection = await resolveModelFirstSelection({
      providerId: selectedProviderId,
      modelId: selectedModel,
      preferredPresetId: selectedPresetId
    });
    if (!resolvedSelection) {
      providerSelectRef.current?.openConfig(selectedProviderId, selectedPresetId);
      return null;
    }

    if (resolvedSelection.providerPresetId !== selectedPresetId) {
      setSelectedPresetId(resolvedSelection.providerPresetId);
    }

    return resolvedSelection;
  }, [selectedModel, selectedPresetId, selectedProviderId]);

  /**
   * 解析翻译结果里的 <word>...</word>：
   * - 从展示文本里移除
   * - 提取单词/短语并去重收集
   */
  const parseTranslationResult = useCallback((raw: string): { displayText: string; words: string[] } => {
    if (!raw) return { displayText: '', words: [] };

    const words: string[] = [];
    const wordTagRe = /<word>([\s\S]*?)<\/word>/gi;

    // 收集 words
    let match: RegExpExecArray | null;
    while ((match = wordTagRe.exec(raw)) !== null) {
      const content = (match[1] || '').trim();
      if (!content) continue;

      // 允许模型返回多个词：用常见分隔符拆一下
      const pieces = content
        .split(/[\n,，、;/；]/g)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of pieces) {
        if (!words.includes(p)) words.push(p);
      }
    }

    // 移除 <word>...</word>
    const displayText = raw.replace(wordTagRe, '').trim();
    return { displayText, words };
  }, []);

  // 将本次新增的 words 合并进 advancedWords（去重）
  const appendAdvancedWords = useCallback((words: string[]) => {
    if (!words || words.length === 0) return;
    setAdvancedWords((prev) => {
      const set = new Set(prev);
      for (const w of words) {
        const normalized = w.trim();
        if (normalized) set.add(normalized);
      }
      return Array.from(set);
    });
  }, []);

  // 顺序翻译所有未翻译的segments
  const translateAllSegments = useCallback(async () => {
    if (translatingRef.current) return;

    const resolvedSelection = await resolveActiveSelection();
    if (!resolvedSelection) return;

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
          // 为了做“打字效果”，这里直接在本方法里流式解析和推送
          await new Promise<void>((resolve, reject) => {
            let rawResult = '';
            let lastPushed = '';

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
            const prompt = `你是一个专业的语言翻译助手，你在翻译完成之后会检查原文有没有高级的词汇，如果有,将高难度的词汇找出来，用<word></word>标签包裹。如：\n翻译内容\n<word></word>\n\n请将以下文本翻译成${targetLangName}，只返回翻译结果和一个高级的英文单词原文，没有高级单词就不要返回<word></word>，不要添加任何解释或说明：\n\n${segment.text}`;

            window.chobits.ai
              .chatStream(
                {
                  messages: [{ role: 'user', content: prompt }],
                  providerId: resolvedSelection.providerId,
                  providerPresetId: resolvedSelection.providerPresetId,
                  stream: true,
                  persist: false,
                  extras: {
                    model: resolvedSelection.modelId
                  }
                },
                (ev: any) => {
                  if (translationAbortRef.current) {
                    resolve();
                    return;
                  }

                  if (ev.type === 'delta' && ev.data?.text) {
                    rawResult += ev.data.text;
                    const parsed = parseTranslationResult(rawResult);
                    const display = parsed.displayText;

                    // 避免过度 setState：只有变化了才推
                    if (onTranslationUpdate && display !== lastPushed) {
                      lastPushed = display;
                      onTranslationUpdate(i, display);
                    }
                  } else if (ev.type === 'message_completed' && ev.data?.message?.content) {
                    rawResult = ev.data.message.content.trim();
                    const parsed = parseTranslationResult(rawResult);
                    appendAdvancedWords(parsed.words);

                    if (onTranslationUpdate) {
                      lastPushed = parsed.displayText;
                      onTranslationUpdate(i, parsed.displayText);
                    }
                  } else if (ev.type === 'done') {
                    const parsed = parseTranslationResult(rawResult);
                    appendAdvancedWords(parsed.words);

                    if (onTranslationUpdate && parsed.displayText !== lastPushed) {
                      onTranslationUpdate(i, parsed.displayText);
                    }
                    resolve();
                  } else if (ev.type === 'error') {
                    reject(new Error(ev.data?.message || '翻译失败'));
                  }
                }
              )
              .catch(reject);
          });
        } catch (error) {
          console.error(`翻译第 ${i + 1} 条失败:`, error);
        }
      }
    } finally {
      translatingRef.current = false;
      setIsTranslating(false);
    }
  }, [appendAdvancedWords, onTranslationUpdate, parseTranslationResult, resolveActiveSelection, segments, targetLanguage]);

  // 监听segments变化，继续翻译新增的
  useEffect(() => {
    if (translationEnabled && canUseAI && !translatingRef.current) {
      // 检查是否有未翻译的
      const hasUntranslated = segments.some((s) => !s.translation);
      if (hasUntranslated) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 新增分段时自动续翻,翻译中的 setState 是有意的进度反馈
        void translateAllSegments();
      }
    }
  }, [canUseAI, translationEnabled, segments, translateAllSegments]);

  // 点击翻译按钮
  const handleTranslationClick = useCallback(() => {
    if (translationEnabled) {
      // 已开启，点击关闭
      setTranslationEnabled(false);
      translationAbortRef.current = true;
      setIsLanguageSelectVisible(false);
    } else {
      // 未开启，显示语言选择
      setIsLanguageSelectVisible(true);
    }
  }, [translationEnabled]);

  // 确认开启翻译
  const handleConfirmTranslation = useCallback(() => {
    setIsLanguageSelectVisible(false);
    setTranslationEnabled(true);
    // 开始翻译
    void translateAllSegments();
  }, [translateAllSegments]);

  // 取消语言选择
  const handleCancelLanguageSelect = useCallback(() => {
    setIsLanguageSelectVisible(false);
  }, []);

  // AI操作：总结
  const handleSummarize = async (): Promise<void> => {
    if (!allText) return;

    const resolvedSelection = await resolveActiveSelection();
    if (!resolvedSelection) return;

    setIsProcessing('summarize');

    const messageId = `summarize-${Date.now()}`;
    // 创建消息气泡
    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        type: 'summarize',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      }
    ]);

    try {
      const prompt = `请对以下语音识别内容进行简洁的总结，突出主要内容和关键信息：\n\n${allText}`;

      let currentResult = '';
      await window.chobits.ai.chatStream(
        {
          messages: [{ role: 'user', content: prompt }],
          providerId: resolvedSelection.providerId,
          providerPresetId: resolvedSelection.providerPresetId,
          stream: true,
          persist: false,
          extras: {
            model: resolvedSelection.modelId
          }
        },
        (ev: any) => {
          if (ev.type === 'delta' && ev.data?.text) {
            currentResult += ev.data.text;
            // 更新消息内容
            setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: currentResult } : msg)));
          } else if (ev.type === 'message_completed' && ev.data?.message?.content) {
            currentResult = ev.data.message.content.trim();
            setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: currentResult, isStreaming: false } : msg)));
          } else if (ev.type === 'done') {
            setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, isStreaming: false } : msg)));
            setIsProcessing(null);
          } else if (ev.type === 'error') {
            setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: '总结失败，请重试', isStreaming: false } : msg)));
            setIsProcessing(null);
          }
        }
      );
    } catch (error) {
      console.error('总结失败:', error);
      setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: '总结失败，请重试', isStreaming: false } : msg)));
      setIsProcessing(null);
    }
  };

  // AI操作：逐个获取高级词汇的解释（自动解释新增词汇）
  const explainNewWords = useCallback(async () => {
    if (explainingRef.current || !vocabularyEnabled) return;

    const resolvedSelection = await resolveActiveSelection();
    if (!resolvedSelection) return;

    // 找出未解释的词汇
    const wordsToExplain = advancedWords.filter((word) => !explainedWords.has(word));
    if (wordsToExplain.length === 0) return;

    explainingRef.current = true;
    setIsExplainingVocabulary(true);

    try {
      for (const word of wordsToExplain) {
        if (vocabularyAbortRef.current) break;

        const messageId = `vocabulary-${word}-${Date.now()}`;
        // 为每个词汇创建独立的消息气泡
        setMessages((prev) => [
          ...prev,
          {
            id: messageId,
            type: 'vocabulary',
            content: '',
            word: word,
            timestamp: Date.now(),
            isStreaming: true
          }
        ]);

        const prompt = `请简短解释这个词汇的含义（返回音标，可能存在翻译，使用示例）：${word}`;

        await new Promise<void>((resolve, reject) => {
          let wordExplanation = '';

          window.chobits.ai
            .chatStream(
              {
                messages: [{ role: 'user', content: prompt }],
                providerId: resolvedSelection.providerId,
                providerPresetId: resolvedSelection.providerPresetId,
                stream: true,
                persist: false,
                extras: {
                  model: resolvedSelection.modelId
                }
              },
              (ev: any) => {
                if (vocabularyAbortRef.current) {
                  resolve();
                  return;
                }

                if (ev.type === 'delta' && ev.data?.text) {
                  wordExplanation += ev.data.text;
                  // 流式更新消息内容
                  setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: wordExplanation } : msg)));
                } else if (ev.type === 'message_completed' && ev.data?.message?.content) {
                  wordExplanation = ev.data.message.content.trim();
                  setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: wordExplanation, isStreaming: false } : msg)));
                } else if (ev.type === 'done') {
                  // 完成一个词汇，标记为已解释
                  setExplainedWords((prev) => new Set(prev).add(word));
                  setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, isStreaming: false } : msg)));
                  resolve();
                } else if (ev.type === 'error') {
                  setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: '获取词汇解释失败', isStreaming: false } : msg)));
                  reject(new Error(ev.data?.message || '获取词汇解释失败'));
                }
              }
            )
            .catch(reject);
        });
      }
    } catch (error) {
      console.error('获取词汇解释失败:', error);
    } finally {
      explainingRef.current = false;
      setIsExplainingVocabulary(false);
    }
  }, [advancedWords, explainedWords, resolveActiveSelection, vocabularyEnabled]);

  // 监听 advancedWords 变化，自动解释新增词汇
  useEffect(() => {
    if (vocabularyEnabled && canUseAI && !explainingRef.current) {
      const hasNewWords = advancedWords.some((word) => !explainedWords.has(word));
      if (hasNewWords) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 新增词汇时自动解释,解释中的 setState 是有意的进度反馈
        void explainNewWords();
      }
    }
  }, [advancedWords, canUseAI, explainedWords, explainNewWords, vocabularyEnabled]);

  // 点击词汇按钮
  const handleExtractVocabulary = useCallback(() => {
    if (vocabularyEnabled) {
      // 已开启，点击关闭
      setVocabularyEnabled(false);
      vocabularyAbortRef.current = true;
    } else {
      // 未开启，开启
      setVocabularyEnabled(true);
      vocabularyAbortRef.current = false;
      // 开始解释
      void explainNewWords();
    }
  }, [vocabularyEnabled, explainNewWords]);

  // AI操作：高光内容
  const handleHighlights = async (): Promise<void> => {
    if (!allText) return;

    const resolvedSelection = await resolveActiveSelection();
    if (!resolvedSelection) return;

    setIsProcessing('highlights');

    const messageId = `highlights-${Date.now()}`;
    // 创建消息气泡
    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        type: 'highlights',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      }
    ]);

    try {
      const prompt = `请从以下语音识别内容中提取最重要、最精彩或最值得关注的内容片段，并简要说明为什么这些内容值得关注：\n\n${allText}`;

      let currentResult = '';
      await window.chobits.ai.chatStream(
        {
          messages: [{ role: 'user', content: prompt }],
          providerId: resolvedSelection.providerId,
          providerPresetId: resolvedSelection.providerPresetId,
          stream: true,
          persist: false,
          extras: {
            model: resolvedSelection.modelId
          }
        },
        (ev: any) => {
          if (ev.type === 'delta' && ev.data?.text) {
            currentResult += ev.data.text;
            setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: currentResult } : msg)));
          } else if (ev.type === 'message_completed' && ev.data?.message?.content) {
            currentResult = ev.data.message.content.trim();
            setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: currentResult, isStreaming: false } : msg)));
          } else if (ev.type === 'done') {
            setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, isStreaming: false } : msg)));
            setIsProcessing(null);
          } else if (ev.type === 'error') {
            setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: '提取高光内容失败，请重试', isStreaming: false } : msg)));
            setIsProcessing(null);
          }
        }
      );
    } catch (error) {
      console.error('提取高光内容失败:', error);
      setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: '提取高光内容失败，请重试', isStreaming: false } : msg)));
      setIsProcessing(null);
    }
  };

  // 获取消息类型标题
  const getMessageTypeLabel = (type: 'vocabulary' | 'summarize' | 'highlights'): string => {
    switch (type) {
      case 'summarize':
        return '内容总结';
      case 'vocabulary':
        return '词汇解释';
      case 'highlights':
        return '高光内容';
      default:
        return '结果';
    }
  };

  // 获取消息类型的颜色样式
  const getMessageColorClass = (
    type: 'vocabulary' | 'summarize' | 'highlights'
  ): {
    header: string;
    icon: string;
    bubble: string;
    bubbleText: string;
  } => {
    switch (type) {
      case 'vocabulary':
        return {
          // 紫色主题 - 词汇解释
          header: 'text-purple-600 dark:text-purple-400',
          icon: 'text-purple-500 dark:text-purple-400',
          bubble:
            'border-l-purple-500 border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:border-l-purple-500 dark:border-purple-800/40 dark:from-purple-950/40 dark:to-purple-900/20 shadow-sm',
          bubbleText: 'text-purple-900 dark:text-purple-50'
        };
      case 'summarize':
        return {
          // 蓝色主题 - 总结
          header: 'text-blue-600 dark:text-blue-400',
          icon: 'text-blue-500 dark:text-blue-400',
          bubble: 'border-l-blue-500 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:border-l-blue-500 dark:border-blue-800/40 dark:from-blue-950/40 dark:to-blue-900/20 shadow-sm',
          bubbleText: 'text-blue-900 dark:text-blue-50'
        };
      case 'highlights':
        return {
          // 橙色主题 - 高光
          header: 'text-orange-600 dark:text-orange-400',
          icon: 'text-orange-500 dark:text-orange-400',
          bubble:
            'border-l-orange-500 border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100/50 dark:border-l-orange-500 dark:border-orange-800/40 dark:from-orange-950/40 dark:to-orange-900/20 shadow-sm',
          bubbleText: 'text-orange-900 dark:text-orange-50'
        };
      default:
        return {
          header: 'text-foreground',
          icon: 'text-foreground',
          bubble: 'border-border bg-muted/50',
          bubbleText: 'text-foreground'
        };
    }
  };

  // 获取翻译进度
  const getTranslationProgress = useCallback(() => {
    if (!translationEnabled) return null;
    const total = segments.length;
    const translated = segments.filter((s) => s.translation).length;
    return { total, translated };
  }, [segments, translationEnabled]);

  const translationProgress = getTranslationProgress();

  return (
    <div className="flex flex-col h-full border-l bg-background no-drag">
      {/* 头部：AI服务配置 */}
      <div className={`px-3 py-2 border-b ${isSubtitleMode ? 'border-border/50' : ''}`}>
        {isProviderConfigVisible ? (
          // 展开的配置表单
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium flex items-center gap-1">
                <TbBrain className="h-3.5 w-3.5" />
                AI 模型
              </Label>
              {providerConfigured && (
                <Button size="sm" variant="ghost" className="h-5 text-xs px-1" onClick={() => setIsProviderConfigVisible(false)}>
                  收起
                </Button>
              )}
            </div>
            <ProviderModelSelect
              ref={providerSelectRef}
              providerId={selectedProviderId}
              presetId={selectedPresetId}
              modelId={selectedModel}
              onChange={(providerId, modelId) => {
                setSelectedProviderId((prevProviderId) => {
                  if (prevProviderId && prevProviderId !== providerId) {
                    setSelectedPresetId('');
                  }
                  return providerId;
                });
                setSelectedModel(modelId);
                setIsProviderConfigVisible(true);
              }}
              onProviderConfigChange={(_providerId, configured) => {
                setProviderConfigured(configured);
              }}
              placeholder="选择 AI 模型"
              buttonVariant="outline"
              buttonSize="default"
              className="w-full justify-between rounded-md h-8 px-3 text-xs"
            />
            {!selectedModel && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <span>请先选择一个模型</span>
                <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={handleOpenProviderConfig}>
                  去设置
                </Button>
              </div>
            )}
            {selectedModel && !providerConfigured && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <span>需要完成服务商配置</span>
                <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={handleOpenProviderConfig}>
                  去配置
                </Button>
              </div>
            )}
            {selectedModel && providerConfigured && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <TbCheck className="h-3.5 w-3.5" />
                <span>模型可用</span>
              </div>
            )}
          </div>
        ) : (
          // 折叠状态：显示当前服务按钮
          <Button variant="ghost" size="sm" className="w-full h-7 justify-between text-xs" onClick={() => setIsProviderConfigVisible(true)}>
            <span className="flex items-center gap-1">
              <TbBrain className="h-3.5 w-3.5" />
              {getSelectionLabel()}
            </span>
            <TbChevronDown className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* 内容区域：AI消息气泡列表 */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">{allText ? '点击下方按钮使用 AI 功能' : '等待语音识别内容...'}</div>
          ) : (
            <>
              {/* 清空所有消息按钮 */}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={() => {
                    setMessages([]);
                  }}
                >
                  清空所有
                </Button>
              </div>
              {messages.map((message) => {
                const colorClass = getMessageColorClass(message.type);
                return (
                  <div key={message.id} className="space-y-2">
                    {/* 消息头部 */}
                    <div className="flex items-center justify-between">
                      <Label className={`text-xs font-medium flex items-center gap-1 ${colorClass.header}`}>
                        {message.type === 'vocabulary' && <TbVocabulary className={`h-3.5 w-3.5 ${colorClass.icon}`} />}
                        {message.type === 'summarize' && <TbSparkles className={`h-3.5 w-3.5 ${colorClass.icon}`} />}
                        {message.type === 'highlights' && <TbListDetails className={`h-3.5 w-3.5 ${colorClass.icon}`} />}
                        <span>
                          {getMessageTypeLabel(message.type)}
                          {message.word && `: ${message.word}`}
                        </span>
                      </Label>
                      <div className="flex items-center gap-1">
                        {message.content && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs px-2"
                            onClick={() => {
                              navigator.clipboard.writeText(message.content);
                            }}
                          >
                            复制
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            setMessages((prev) => prev.filter((m) => m.id !== message.id));
                          }}
                        >
                          <TbX className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {/* 消息内容气泡 */}
                    <div className={`p-3 pl-4 rounded-lg border-l-4 text-sm whitespace-pre-wrap ${colorClass.bubble} ${colorClass.bubbleText}`}>
                      {message.isStreaming && !message.content ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <TbLoader2 className="h-4 w-4 animate-spin" />
                          <span>生成中...</span>
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </ScrollArea>

      {/* 底部：功能按钮 */}
      <div className={`px-3 py-2 border-t space-y-2 ${isSubtitleMode ? 'border-border/50' : ''}`}>
        {/* 高级词汇（从翻译结果 <word>...</word> 提取，去重） */}
        {advancedWords.length > 0 && (
          <div className="flex items-start justify-between gap-2 p-2 rounded-lg border bg-muted/30">
            <div className="min-w-0">
              <div className="text-xs font-medium">高级词汇</div>
              <div className="text-xs text-muted-foreground break-words">{advancedWords.join('、')}</div>
            </div>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setAdvancedWords([])}>
              清空
            </Button>
          </div>
        )}

        {/* 翻译语言选择（仅在选择时显示） */}
        {isLanguageSelectVisible && (
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
              <Button size="icon" variant={translationEnabled ? 'default' : 'outline'} className="h-8 w-8" onClick={handleTranslationClick} disabled={!canUseAI || isProcessing !== null}>
                {isTranslating ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbLanguage className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{translationEnabled ? (translationProgress ? `翻译中 ${translationProgress.translated}/${translationProgress.total}` : '翻译中...') : '翻译'}</TooltipContent>
          </Tooltip>

          {/* 总结按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleSummarize} disabled={!canUseAI || !allText || isProcessing !== null}>
                {isProcessing === 'summarize' ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbSparkles className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>总结</TooltipContent>
          </Tooltip>

          {/* 词汇按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={vocabularyEnabled ? 'default' : 'outline'}
                className="h-8 w-8"
                onClick={handleExtractVocabulary}
                disabled={!canUseAI || (isProcessing !== null && !vocabularyEnabled)}
              >
                {isExplainingVocabulary ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbVocabulary className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {vocabularyEnabled
                ? isExplainingVocabulary
                  ? `解释词汇中 ${explainedWords.size}/${advancedWords.length}`
                  : `已解释 ${explainedWords.size}/${advancedWords.length}`
                : advancedWords.length > 0
                  ? '词汇解释'
                  : '暂无高级词汇'}
            </TooltipContent>
          </Tooltip>

          {/* 高光按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleHighlights} disabled={!canUseAI || !allText || isProcessing !== null}>
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
