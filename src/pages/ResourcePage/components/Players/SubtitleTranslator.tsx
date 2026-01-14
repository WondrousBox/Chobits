import { AimSegments } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbLanguage, TbPlayerStop } from 'react-icons/tb';

import { ProviderModelSelect, ProviderModelSelectRef } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  model?: string;
  service?: TranslationService;
  targetLanguage: string;
  timestamp: number;
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
  selectedModel?: string;
  selectedService?: TranslationService;
  targetLanguage?: string;
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

export const SubtitleTranslator: React.FC<SubtitleTranslatorProps> = ({
  subtitleEntries,
  onTranslateComplete,
  resourceId,
  isLoading,
  debouncedSave,
  isTranslating = false,
  translationProgress = 0,
  onStopTranslation,
  onTranslationStart
}) => {
  // 从 localStorage 加载保存的偏好设置
  const savedPreferences = loadPreferences();

  const [isTranslationPopoverOpen, setIsTranslationPopoverOpen] = useState(false);
  const [translationMode, setTranslationMode] = useState<'ai' | 'normal'>(savedPreferences?.translationMode || 'ai');
  const [history, setHistory] = useState<TranslationHistoryItem[]>(savedPreferences?.history || []);

  // AI 翻译相关状态
  const [selectedProviderId, setSelectedProviderId] = useState<string>(savedPreferences?.selectedProviderId || '');
  const [selectedModel, setSelectedModel] = useState<string>(savedPreferences?.selectedModel || '');
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);

  // ProviderModelSelect ref
  const providerSelectRef = useRef<ProviderModelSelectRef>(null);

  // 当 provider 配置状态变化时的回调
  const handleProviderConfigChange = useCallback((id: string, configured: boolean) => {
    setProviderConfigured(configured);
  }, []);

  // 打开配置窗口的回调
  const handleOpenConfig = useCallback(async (providerId: string, fields: string[]) => {
    await window.YUA.window['window:open']('aiProviderConfig' as any, { providerId, fields }, { sameDisplayAsSender: true });
  }, []);

  // 普通翻译相关状态
  const [selectedService, setSelectedService] = useState<TranslationService>(savedPreferences?.selectedService || 'google');

  // 共用状态
  const [targetLanguage, setTargetLanguage] = useState<string>(savedPreferences?.targetLanguage || 'en');

  // 保存偏好设置到 localStorage
  useEffect(() => {
    savePreferences({
      translationMode,
      selectedProviderId,
      selectedModel,
      selectedService,
      targetLanguage,
      history
    });
  }, [translationMode, selectedProviderId, selectedModel, selectedService, targetLanguage, history]);

  // 添加到历史记录
  const addToHistory = useCallback((item: Omit<TranslationHistoryItem, 'timestamp'>) => {
    setHistory((prev) => {
      const newItem = { ...item, timestamp: Date.now() };
      // 过滤掉重复项（相同的配置）
      const filtered = prev.filter((h) => {
        if (item.mode === 'ai') {
          return !(h.mode === 'ai' && h.providerId === item.providerId && h.model === item.model && h.targetLanguage === item.targetLanguage);
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
      if (item.model) setSelectedModel(item.model);
    } else {
      if (item.service) setSelectedService(item.service);
    }
  }, []);

  // 处理服务商和模型的选择
  const handleProviderModelChange = useCallback((providerId: string, modelId: string) => {
    setSelectedProviderId(providerId);
    setSelectedModel(modelId);
  }, []);

  // 繁忙提示对话框状态
  const [busyDialogState, setBusyDialogState] = useState<{
    open: boolean;
    providerId: string;
    activeCount: number;
  }>({ open: false, providerId: '', activeCount: 0 });

  // 执行 AI 翻译的核心逻辑
  const executeAITranslation = useCallback(
    async (params: { providerId: string; model: string; targetLang: string; force: boolean }) => {
      const { providerId, model, targetLang, force } = params;

      // 过滤掉已删除的片段
      const validSegments = subtitleEntries.filter((seg) => !seg.delete);
      if (validSegments.length === 0) return;

      setIsTranslationPopoverOpen(false);
      setBusyDialogState((prev) => ({ ...prev, open: false }));

      try {
        // 准备翻译数据
        const segmentsData = validSegments.map((seg, idx) => ({
          text: seg.text,
          index: idx
        }));

        // 调用主进程的翻译功能
        const { requestId } = await window.YUA.ai.translate({
          providerId,
          model,
          segments: segmentsData,
          targetLanguage: targetLang,
          languageNames,
          force,
          metadata: {
            resourceId
          }
        });

        // 记录到历史
        addToHistory({
          mode: 'ai',
          providerId,
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
    [subtitleEntries, addToHistory, onTranslationStart]
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

    // 检查服务商状态
    try {
      const status = await window.YUA.ai.getProviderTranslationStatus(selectedProviderId);
      if (status.busy) {
        setBusyDialogState({
          open: true,
          providerId: selectedProviderId,
          activeCount: status.activeRequests.length
        });
        return;
      }
    } catch (error) {
      console.error('检查服务商状态失败:', error);
    }

    // 如果不繁忙，直接开始
    await executeAITranslation({
      providerId: selectedProviderId,
      model: selectedModel,
      targetLang: targetLanguage,
      force: false
    });
  }, [selectedProviderId, selectedModel, targetLanguage, subtitleEntries, executeAITranslation]);

  // 强制开始翻译
  const handleForceStart = useCallback(() => {
    executeAITranslation({
      providerId: selectedProviderId,
      model: selectedModel,
      targetLang: targetLanguage,
      force: true
    });
  }, [selectedProviderId, selectedModel, targetLanguage, executeAITranslation]);

  // 切换到历史记录中的其他服务商并尝试开始
  const handleSwitchAndStart = useCallback(
    (item: TranslationHistoryItem) => {
      if (item.mode !== 'ai' || !item.providerId || !item.model) return;

      // 更新当前选择
      applyHistory(item);

      // 直接开始翻译
      executeAITranslation({
        providerId: item.providerId,
        model: item.model,
        targetLang: item.targetLanguage,
        force: false
      });
    },
    [applyHistory, executeAITranslation]
  );

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
    // setIsTranslating(true); // 暂时不支持普通翻译的进度显示，或者也需要父组件支持

    try {
      // 模拟翻译过程
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 这里应该调用实际的翻译服务 API
      // 例如：await window.YUA.translation.translate({ service: selectedService, text: ..., targetLanguage: ... })

      // 临时占位：直接使用原文（实际应该调用翻译 API）
      const updated = [...subtitleEntries];

      // 记录到历史
      addToHistory({
        mode: 'normal',
        service: selectedService,
        targetLanguage
      });

      // 通知父组件更新
      onTranslateComplete(updated);

      // 触发保存
      if (resourceId && !isLoading) {
        debouncedSave(resourceId, updated);
      }

      // setIsTranslating(false);
    } catch (error) {
      console.error('翻译失败:', error);
      // setIsTranslating(false);
    }
  }, [selectedService, targetLanguage, subtitleEntries, resourceId, isLoading, debouncedSave, onTranslateComplete]);

  return (
    <div className="flex items-center justify-end gap-2 px-3 py-1">
      {isTranslating ? (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onStopTranslation}>
          <TbPlayerStop className="animate-pulse" />
          停止翻译<span className="font-mono">({translationProgress}%)</span>
        </Button>
      ) : (
        <Popover open={isTranslationPopoverOpen} onOpenChange={setIsTranslationPopoverOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <TbLanguage />
              翻译
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            {history.length > 0 && (
              <div className="mb-4 space-y-2 border-b pb-4">
                <Label className="text-xs font-medium text-muted-foreground">最近使用</Label>
                <div className="flex flex-wrap gap-2">
                  {history.map((item, index) => (
                    <Button key={index} variant="outline" size="sm" className="h-auto py-1 px-2 text-xs flex flex-col items-start gap-0.5" onClick={() => applyHistory(item)}>
                      <span className="font-medium">{item.mode === 'ai' ? `${item.providerId} · ${item.model}` : translationServices.find((s) => s.value === item.service)?.label}</span>
                      <span className="text-[10px] text-muted-foreground">→ {languageNames[item.targetLanguage] || item.targetLanguage}</span>
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
                  <Label className="text-sm font-medium">翻译模型</Label>
                  <ProviderModelSelect
                    ref={providerSelectRef}
                    providerId={selectedProviderId}
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
      )}

      {/* 繁忙提示对话框 */}
      <Dialog open={busyDialogState.open} onOpenChange={(open) => setBusyDialogState((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>服务商繁忙</DialogTitle>
            <DialogDescription>当前有 {busyDialogState.activeCount} 个正在进行的翻译任务。</DialogDescription>
          </DialogHeader>

          {/* 最近使用的其他服务商 */}
          {history.filter((h) => h.mode === 'ai' && h.providerId !== busyDialogState.providerId).length > 0 && (
            <div className="py-2">
              <Label className="text-xs font-medium text-muted-foreground mb-2 block">切换到最近使用的其他配置：</Label>
              <div className="flex flex-wrap gap-2">
                {history
                  .filter((h) => h.mode === 'ai' && h.providerId !== busyDialogState.providerId)
                  .slice(0, 3)
                  .map((item, index) => (
                    <Button key={index} variant="outline" size="sm" className="h-auto py-1 px-2 text-xs flex flex-col items-start gap-0.5" onClick={() => handleSwitchAndStart(item)}>
                      <span className="font-medium">{`${item.providerId} · ${item.model}`}</span>
                      <span className="text-[10px] text-muted-foreground">→ {languageNames[item.targetLanguage] || item.targetLanguage}</span>
                    </Button>
                  ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBusyDialogState((prev) => ({ ...prev, open: false }))}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleForceStart}>
              强制开始
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
