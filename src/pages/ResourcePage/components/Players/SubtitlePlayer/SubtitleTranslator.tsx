import { AimSegments } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbBook, TbLanguage, TbPlayerStop } from 'react-icons/tb';

import { ProviderModelSelect, ProviderModelSelectRef } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ServicePresetSelect from '@/pages/ChatPage/components/ServicePresetSelect';

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
  resourceId: string;
  isTranslating?: boolean;
  translationProgress?: number;
  onStopTranslation?: () => void;
  onTranslationStart?: (requestId: string) => void;
}

// 翻译服务类型
type TranslationService = 'google' | 'microsoft' | 'deepl';

const translationServices: { value: TranslationService; label: string }[] = [
  { value: 'google', label: 'Google 翻译' },
  { value: 'microsoft', label: '微软翻译' },
  { value: 'deepl', label: 'DeepL' }
];

// 翻译历史记录项
interface TranslationHistoryItem {
  mode: 'ai' | 'normal';
  providerId?: string;
  presetId?: string;
  model?: string;
  service?: TranslationService;
  targetLanguage: string;
  timestamp: number;
}

// 术语表类型
interface GlossaryCategory {
  id: string;
  name: string;
  description?: string;
}

interface GlossaryItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  entries: Array<{ source: string; target: string; note?: string }>;
}

// localStorage 键名
const STORAGE_KEY = 'subtitle-translator-preferences';

// 从 localStorage 读取保存的偏好设置
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

// 保存偏好设置到 localStorage
const savePreferences = (preferences: {
  translationMode?: 'ai' | 'normal';
  selectedProviderId?: string;
  selectedPresetId?: string;
  selectedModel?: string;
  selectedService?: TranslationService;
  targetLanguage?: string;
  selectedGlossaryIds?: string[];
  history?: TranslationHistoryItem[];
}): void => {
  try {
    const existing = loadPreferences() || {};
    const updated = { ...existing, ...preferences };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('保存翻译偏好设置失败:', error);
  }
};

export const SubtitleTranslator: React.FC<SubtitleTranslatorProps> = ({ subtitleEntries, resourceId, isTranslating = false, translationProgress = 0, onStopTranslation, onTranslationStart }) => {
  // 从 localStorage 加载保存的偏好设置
  const savedPreferences = loadPreferences();

  const [isTranslationPopoverOpen, setIsTranslationPopoverOpen] = useState(false);
  const [translationMode, setTranslationMode] = useState<'ai' | 'normal'>(savedPreferences?.translationMode || 'ai');
  const [history, setHistory] = useState<TranslationHistoryItem[]>(savedPreferences?.history || []);

  // AI 翻译相关状态
  const [selectedProviderId, setSelectedProviderId] = useState<string>(savedPreferences?.selectedProviderId || '');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(savedPreferences?.selectedPresetId || '');
  const [selectedModel, setSelectedModel] = useState<string>(savedPreferences?.selectedModel || '');
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);

  // ProviderModelSelect ref
  const providerSelectRef = useRef<ProviderModelSelectRef>(null);

  // 当 provider 配置状态变化时的回调
  const handleProviderConfigChange = useCallback((id: string, configured: boolean) => {
    setProviderConfigured(configured);
  }, []);

  // 打开配置窗口的回调
  const handleOpenConfig = useCallback(async (providerId: string, fields: string[], presetId?: string) => {
    await window.YUA.window['window:open']('aiProviderConfig' as any, { providerId, presetId, fields }, { sameDisplayAsSender: true });
  }, []);

  // 普通翻译相关状态
  const [selectedService, setSelectedService] = useState<TranslationService>(savedPreferences?.selectedService || 'google');

  // 共用状态
  const [targetLanguage, setTargetLanguage] = useState<string>(savedPreferences?.targetLanguage || 'en');

  // 术语表相关状态
  const [glossaryCategories, setGlossaryCategories] = useState<GlossaryCategory[]>([]);
  const [glossaryItems, setGlossaryItems] = useState<GlossaryItem[]>([]);
  const [selectedGlossaryIds, setSelectedGlossaryIds] = useState<string[]>(savedPreferences?.selectedGlossaryIds || []);
  const [glossaryPopoverOpen, setGlossaryPopoverOpen] = useState(false);

  // 加载术语表数据
  useEffect(() => {
    const loadGlossaries = async (): Promise<void> => {
      try {
        const [cats, items] = await Promise.all([window.YUA.ai.listGlossaryCategories(), window.YUA.ai.listGlossaries()]);
        setGlossaryCategories(cats || []);
        setGlossaryItems(items || []);
      } catch (error) {
        console.error('加载术语表失败:', error);
      }
    };
    void loadGlossaries();
  }, []);

  // 合并选中的术语表条目
  const mergedGlossaryEntries = useMemo(() => {
    if (selectedGlossaryIds.length === 0) return [];
    const entries: Array<{ source: string; target: string; note?: string }> = [];
    const seen = new Set<string>();
    for (const id of selectedGlossaryIds) {
      const glossary = glossaryItems.find((g) => g.id === id);
      if (glossary) {
        for (const entry of glossary.entries) {
          const key = entry.source.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            entries.push(entry);
          }
        }
      }
    }
    return entries;
  }, [selectedGlossaryIds, glossaryItems]);

  // 切换术语表选择
  const toggleGlossarySelection = useCallback((id: string) => {
    setSelectedGlossaryIds((prev) => (prev.includes(id) ? prev.filter((gid) => gid !== id) : [...prev, id]));
  }, []);

  // 保存偏好设置到 localStorage
  useEffect(() => {
    savePreferences({
      translationMode,
      selectedProviderId,
      selectedPresetId,
      selectedModel,
      selectedService,
      targetLanguage,
      selectedGlossaryIds,
      history
    });
  }, [translationMode, selectedPresetId, selectedProviderId, selectedModel, selectedService, targetLanguage, selectedGlossaryIds, history]);

  // 添加到历史记录
  const addToHistory = useCallback((item: Omit<TranslationHistoryItem, 'timestamp'>) => {
    setHistory((prev) => {
      const newItem = { ...item, timestamp: Date.now() };
      // 过滤掉重复项（相同的配置）
      const filtered = prev.filter((h) => {
        if (item.mode === 'ai') {
          return !(h.mode === 'ai' && h.providerId === item.providerId && h.presetId === item.presetId && h.model === item.model && h.targetLanguage === item.targetLanguage);
        } else {
          return !(h.mode === 'normal' && h.service === item.service && h.targetLanguage === item.targetLanguage);
        }
      });
      // 将新项添加到开头，保留最近 5 条
      return [newItem, ...filtered].slice(0, 5);
    });
  }, []);

  // 应用历史记录
  const applyHistory = useCallback((item: TranslationHistoryItem) => {
    setTranslationMode(item.mode);
    setTargetLanguage(item.targetLanguage);
    if (item.mode === 'ai') {
      if (item.providerId) setSelectedProviderId(item.providerId);
      setSelectedPresetId(item.presetId || '');
      if (item.model) setSelectedModel(item.model);
    } else {
      if (item.service) setSelectedService(item.service);
    }
  }, []);

  // 处理服务商和模型的选择
  const handleProviderModelChange = useCallback((providerId: string, modelId: string) => {
    setSelectedProviderId((prevProviderId) => {
      if (prevProviderId && prevProviderId !== providerId) {
        setSelectedPresetId('');
      }
      return providerId;
    });
    setSelectedModel(modelId);
  }, []);

  // 执行 AI 翻译的核心逻辑
  const executeAITranslation = useCallback(
    async (params: { providerId: string; model: string; targetLang: string }) => {
      const { providerId, model, targetLang } = params;

      // 过滤掉已删除的片段
      const validSegments = subtitleEntries.filter((seg) => !seg.delete);
      if (validSegments.length === 0) return;

      setIsTranslationPopoverOpen(false);

      try {
        // 调用主进程的翻译功能
        const { requestId } = await window.YUA.ai.translate({
          providerId,
          providerPresetId: selectedPresetId || undefined,
          model,
          targetLanguage: targetLang,
          languageNames,
          resourceId,
          metadata: {
            resourceId
          },
          options: {
            glossary: mergedGlossaryEntries.length > 0 ? mergedGlossaryEntries : undefined
          }
        });

        // 记录到历史
        addToHistory({
          mode: 'ai',
          providerId,
          presetId: selectedPresetId || undefined,
          model,
          targetLanguage: targetLang
        });

        // 通知父组件翻译开始
        if (onTranslationStart && requestId) {
          onTranslationStart(requestId);
        }
      } catch (error) {
        console.error('翻译失败:', error);
      }
    },
    [subtitleEntries, addToHistory, onTranslationStart, mergedGlossaryEntries, resourceId, selectedPresetId]
  );

  // AI 翻译功能入口
  const handleAITranslate = useCallback(async () => {
    if (!selectedProviderId || !selectedModel || !targetLanguage || subtitleEntries.length === 0) {
      return;
    }

    // 检查API配置
    const isConfigured = await providerSelectRef.current?.checkConfig(selectedProviderId);
    if (!isConfigured) {
      providerSelectRef.current?.openConfig(selectedProviderId);
      return;
    }

    // 直接开始翻译
    await executeAITranslation({
      providerId: selectedProviderId,
      model: selectedModel,
      targetLang: targetLanguage
    });
  }, [selectedProviderId, selectedModel, targetLanguage, subtitleEntries, executeAITranslation]);

  return isTranslating ? (
    <Button size="sm" variant="outline" onClick={onStopTranslation}>
      <TbPlayerStop className="animate-pulse" />
      停止翻译<span className="font-mono">({translationProgress}%)</span>
    </Button>
  ) : (
    <Popover open={isTranslationPopoverOpen} onOpenChange={setIsTranslationPopoverOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost">
          <TbLanguage />
          翻译
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {history.length > 0 && (
          <div className="mb-4 space-y-2 border-b pb-4">
            <Label className="text-xs font-medium text-muted-foreground">最近使用</Label>
            <div className="flex flex-wrap gap-1">
              {history.slice(0, 2).map((item, index) => (
                <Button key={index} variant="outline" size="sm" className="text-xs flex flex-col items-start gap-0.5 w-full" onClick={() => applyHistory(item)}>
                  <span className="font-medium">
                    {item.mode === 'ai' ? `${item.providerId} · ${item.model}` : translationServices.find((s) => s.value === item.service)?.label} →{' '}
                    {languageNames[item.targetLanguage] || item.targetLanguage}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        )}
        <Tabs value={translationMode} onValueChange={(value) => setTranslationMode(value as 'ai' | 'normal')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="ai">AI 翻译</TabsTrigger>
            <TabsTrigger value="normal">普通翻译</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-4 mt-0">
            <div className="space-y-2">
              <Label className="text-sm font-medium">模型预设</Label>
              <ServicePresetSelect
                providerId={selectedProviderId}
                presetId={selectedPresetId}
                onChange={(providerId, presetId) => {
                  setSelectedProviderId(providerId);
                  setSelectedPresetId(presetId);
                }}
                buttonVariant="outline"
                buttonSize="default"
                className="w-full justify-between"
                placeholder="选择服务商 · 预设"
              />
            </div>

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

            {/* 术语表选择 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">翻译术语</Label>
                {selectedGlossaryIds.length > 0 && <span className="text-xs text-muted-foreground">已选 {selectedGlossaryIds.length} 个</span>}
              </div>
              <Popover open={glossaryPopoverOpen} onOpenChange={setGlossaryPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-9 font-normal">
                    <span className="flex items-center gap-2">
                      <TbBook className="h-4 w-4" />
                      {selectedGlossaryIds.length > 0 ? (
                        <span className="truncate">
                          {glossaryItems
                            .filter((g) => selectedGlossaryIds.includes(g.id))
                            .map((g) => g.name)
                            .join(', ')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">选择术语表（可选）</span>
                      )}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-0">
                  <div className="p-2 border-b">
                    <div className="text-sm font-medium">选择术语表</div>
                    <div className="text-xs text-muted-foreground">选中的术语将用于指导翻译</div>
                  </div>
                  <ScrollArea className="h-[200px]">
                    {glossaryItems.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        <p>暂无术语表</p>
                        <p className="text-xs mt-1">去设置中添加</p>
                      </div>
                    ) : (
                      <div className="p-1">
                        {glossaryCategories.map((cat) => {
                          const catItems = glossaryItems.filter((g) => g.categoryId === cat.id);
                          if (catItems.length === 0) return null;
                          return (
                            <div key={cat.id} className="mb-2">
                              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{cat.name}</div>
                              {catItems.map((g) => (
                                <TooltipProvider key={g.id}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 ${
                                          selectedGlossaryIds.includes(g.id) ? 'bg-accent text-accent-foreground' : ''
                                        }`}
                                        onClick={() => toggleGlossarySelection(g.id)}
                                      >
                                        <input type="checkbox" checked={selectedGlossaryIds.includes(g.id)} onChange={() => toggleGlossarySelection(g.id)} className="h-3.5 w-3.5" />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm truncate">{g.name}</div>
                                          <div className="text-xs text-muted-foreground">{g.entries.length} 个术语</div>
                                        </div>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-xs">
                                      <div className="text-xs">
                                        {g.entries.slice(0, 5).map((e, i) => (
                                          <div key={i}>
                                            {e.source} → {e.target}
                                          </div>
                                        ))}
                                        {g.entries.length > 5 && <div className="text-muted-foreground">...还有 {g.entries.length - 5} 个</div>}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                  {selectedGlossaryIds.length > 0 && (
                    <div className="p-2 border-t">
                      <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => setSelectedGlossaryIds([])}>
                        清除选择
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              {mergedGlossaryEntries.length > 0 && <div className="text-xs text-muted-foreground">共 {mergedGlossaryEntries.length} 个术语将用于翻译</div>}
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

            <Button size="sm" className="w-full" disabled={!selectedService || !targetLanguage || isTranslating || subtitleEntries.length === 0}>
              开始翻译
            </Button>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};
