import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { TbChevronDown, TbCpu } from 'react-icons/tb';

import TintableSvg from '@/components/common/TintableSvg';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { resolveProviderIdentity } from '@/lib/ai-provider-identity';

// 支持的模型类型
export type ModelType = 'chat' | 'embedding' | 'audio' | 'image' | 'tooling' | 'video' | 'vision' | 'realtime' | 'tool' | string;

type ProviderRow = {
  id: string;
  aliases?: string[];
  label: string;
  capabilities?: {
    chat: boolean;
    embeddings: boolean;
    imageGeneration: boolean;
    modelListing: boolean;
    musicGeneration: boolean;
    transcribe: boolean;
  };
  kind?: string;
  defaultModel?: string;
  defaultModels?: {
    chat?: string;
    embeddings?: string;
    imageGeneration?: string;
    musicGeneration?: string;
    transcribe?: string;
  };
  schema?: {
    icon?: string;
    locales?: Record<string, { label?: string; fields?: Record<string, string> }>;
    fields?: Array<{ key: string; label: string; type: string; required?: boolean; options?: any[] }>;
  };
};

type ModelRow = {
  id: string;
  label?: string;
  type?: string;
  context?: number;
  pricing?: any;
  tags?: string[];
  description?: string;
  free?: boolean;
};

// 暴露给父组件的方法
export interface ProviderModelSelectRef {
  openConfig: (providerId?: string, presetId?: string) => void;
  checkConfig: (providerId: string, presetId?: string) => Promise<boolean>;
}

export interface ProviderModelSelectProps {
  providerId?: string;
  presetId?: string;
  modelId?: string;
  onChange: (providerId: string, modelId: string) => void;
  placeholder?: string;
  buttonVariant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  triggerMode?: 'default' | 'icon';
  className?: string;
  // 是否自动加载第一个provider的模型
  autoLoadFirst?: boolean;
  // 当菜单打开/关闭时的回调
  onOpenChange?: (open: boolean) => void;
  onOpenPrepare?: () => void;
  menuSide?: React.ComponentPropsWithoutRef<typeof DropdownMenuContent>['side'];
  menuAlign?: React.ComponentPropsWithoutRef<typeof DropdownMenuContent>['align'];
  avoidCollisions?: React.ComponentPropsWithoutRef<typeof DropdownMenuContent>['avoidCollisions'];
  subMenuSide?: 'top' | 'right' | 'bottom' | 'left';
  // 筛选的模型类型（数组），如果为空则不筛选
  modelTypes?: ModelType[];
  // 是否在二级菜单中显示模型的详细信息（描述、价格、是否免费、上下文大小等）
  showModelDetails?: boolean;
  // 当 providers 加载完成时的回调，用于向父组件传递 providers 数据
  onProvidersLoaded?: (providers: ProviderRow[]) => void;
  // 当 provider 配置状态变化时的回调
  onProviderConfigChange?: (providerId: string, isConfigured: boolean) => void;
  // 当需要打开配置窗口时的回调，传入 providerId 和需要配置的字段
  onOpenConfig?: (providerId: string, requiredFields: string[], presetId?: string) => void;
  // 过滤可见的 provider
  providerFilter?: (provider: ProviderRow) => boolean;
}

// 类型显示名称
const typeDisplay = (t?: string): string => {
  switch ((t || '').toLowerCase()) {
    case 'chat':
      return '对话';
    case 'vision':
      return '视觉';
    case 'image':
      return '图像';
    case 'text2music':
      return '音乐';
    case 'video':
      return '视频';
    case 'audio':
      return '音频';
    case 'embedding':
      return '向量';
    case 'realtime':
      return '实时';
    case 'tool':
    case 'tooling':
      return '工具';
    default:
      return t || '';
  }
};

// 类型颜色样式
const typeColorClasses = (t?: string): string => {
  switch ((t || '').toLowerCase()) {
    case 'chat':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'vision':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'image':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    case 'text2music':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'video':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'audio':
      return 'bg-teal-100 text-teal-700 border-teal-200';
    case 'embedding':
      return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    case 'realtime':
      return 'bg-violet-100 text-violet-700 border-violet-200';
    case 'tool':
    case 'tooling':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

// 筛选模型
const filterModelsByType = (models: any[], modelTypes?: ModelType[]): any[] => {
  if (!modelTypes || modelTypes.length === 0) {
    return models;
  }
  return models.filter((model) => {
    const modelType = (model.type || '').toLowerCase();
    return modelTypes.some((type) => type.toLowerCase() === modelType);
  });
};

// 判断模型是否免费
const isFree = (model?: any): boolean => {
  if (!model) return false;
  return (model as any)?.free === true || (Array.isArray(model.tags) && model.tags.includes('free'));
};

// 渲染上下文大小标签
const renderContextPill = (model?: any): React.ReactNode => {
  if (!model?.context) return null;
  const k = Math.round((model.context as number) / 1000);
  if (!k) return null;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">{k}k ctx</span>;
};

const getModelsCacheKey = (providerId?: string, presetId?: string): string => `${providerId || ''}::${presetId || ''}`;

const resolveDefaultModelFromTypes = (provider: ProviderRow | undefined, modelTypes?: ModelType[]): string | undefined => {
  const defaults = provider?.defaultModels;
  if (!defaults) {
    return provider?.defaultModel;
  }

  const requestedTypes = (modelTypes || []).map((type) => String(type || '').toLowerCase()).filter(Boolean);
  for (const type of requestedTypes) {
    if (type === 'embedding' && defaults.embeddings) return defaults.embeddings;
    if (type === 'audio' && defaults.transcribe) return defaults.transcribe;
    if (type === 'image' && defaults.imageGeneration) return defaults.imageGeneration;
    if (type === 'text2music' && defaults.musicGeneration) return defaults.musicGeneration;
    if ((type === 'chat' || type === 'vision' || type === 'realtime' || type === 'tool' || type === 'tooling' || type === 'video') && defaults.chat) {
      return defaults.chat;
    }
  }

  return defaults.chat || provider?.defaultModel;
};

const resolvePreferredModelId = (provider: ProviderRow | undefined, models: ModelRow[], modelTypes?: ModelType[]): string | undefined => {
  const filteredModels = filterModelsByType(models, modelTypes) as ModelRow[];
  const providerDefaultModel = resolveDefaultModelFromTypes(provider, modelTypes);
  const preferredModel =
    (providerDefaultModel ? filteredModels.find((model) => model.id === providerDefaultModel) || models.find((model) => model.id === providerDefaultModel) : undefined) ||
    filteredModels[0] ||
    models[0];

  return preferredModel?.id;
};

export const ProviderModelSelect = forwardRef<ProviderModelSelectRef, ProviderModelSelectProps>(
  (
    {
      providerId,
      presetId,
      modelId,
      onChange,
      placeholder = '选择服务商 · 模型',
      buttonVariant = 'outline',
      buttonSize = 'sm',
      triggerMode = 'default',
      className,
      autoLoadFirst = true,
      onOpenChange,
      onOpenPrepare,
      menuSide,
      menuAlign,
      avoidCollisions,
      subMenuSide,
      modelTypes,
      showModelDetails = false,
      onProvidersLoaded,
      onProviderConfigChange,
      onOpenConfig,
      providerFilter
    },
    ref
  ) => {
    const [providers, setProviders] = useState<ProviderRow[]>([]);
    const [modelsMap, setModelsMap] = useState<Record<string, ModelRow[]>>({});
    const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState<string>('');
    const availableProviders = useMemo(() => (providerFilter ? providers.filter((provider) => providerFilter(provider)) : providers), [providerFilter, providers]);
    const resolvedProvider = useMemo(() => resolveProviderIdentity(availableProviders, providerId) || resolveProviderIdentity(providers, providerId), [availableProviders, providerId, providers]);
    const resolvedProviderId = resolvedProvider?.id || providerId;
    const currentModelsCacheKey = useMemo(() => getModelsCacheKey(resolvedProviderId, presetId), [resolvedProviderId, presetId]);

    // 加载指定provider的模型列表
    const loadModelsForProvider = useCallback(
      async (targetProviderId: string, options?: { forceAutoSelect?: boolean; provider?: ProviderRow }) => {
        const targetPresetId = targetProviderId === resolvedProviderId ? presetId : undefined;
        const cacheKey = getModelsCacheKey(targetProviderId, targetPresetId);

        if (modelsMap[cacheKey] || loadingModels[cacheKey]) {
          return;
        }

        setLoadingModels((prev) => ({ ...prev, [cacheKey]: true }));
        try {
          const modelList = ((await window.YUA.ai.listModels(targetProviderId, targetPresetId)) || []) as ModelRow[];
          setModelsMap((prev) => ({ ...prev, [cacheKey]: modelList }));

          const shouldAutoSelect = options?.forceAutoSelect || targetProviderId === resolvedProviderId;
          if (shouldAutoSelect && modelList.length > 0) {
            const preferredModelId = resolvePreferredModelId(
              options?.provider || resolveProviderIdentity(availableProviders, targetProviderId) || resolveProviderIdentity(providers, targetProviderId),
              modelList,
              modelTypes
            );
            const visibleModels = ((filterModelsByType(modelList, modelTypes) as ModelRow[]).length > 0 ? (filterModelsByType(modelList, modelTypes) as ModelRow[]) : modelList) as ModelRow[];
            const hasCurrentModel = !!modelId && visibleModels.some((model) => model.id === modelId);

            if (preferredModelId && (!hasCurrentModel || options?.forceAutoSelect)) {
              onChange(targetProviderId, preferredModelId);
            }
          }
        } catch (error) {
          console.error(`加载 ${targetProviderId} 的模型列表失败:`, error);
          setModelsMap((prev) => ({ ...prev, [cacheKey]: [] }));
        } finally {
          setLoadingModels((prev) => {
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
        }
      },
      [availableProviders, loadingModels, modelId, modelTypes, modelsMap, onChange, presetId, providers, resolvedProviderId]
    );

    // 检测 Provider 配置状态
    const checkProviderConfig = useCallback(
      async (targetProviderId: string, targetPresetId?: string): Promise<boolean> => {
        if (!targetProviderId) {
          onProviderConfigChange?.('', false);
          return false;
        }

        try {
          const provider = providers.find((p) => p.id === targetProviderId);
          const resolved = resolveProviderIdentity(availableProviders, targetProviderId) || resolveProviderIdentity(providers, targetProviderId);
          const resolvedId = resolved?.id || targetProviderId;
          if (!provider && !resolved) {
            onProviderConfigChange?.(resolvedId, false);
            return false;
          }

          // 获取 provider 的 schema，检查 required 字段
          const schema = (provider || resolved)?.schema;
          const requiredFields = schema?.fields?.filter((f: any) => f.required) || [];

          if (requiredFields.length === 0) {
            // 如果没有 required 字段，认为已配置
            onProviderConfigChange?.(resolvedId, true);
            return true;
          }

          const preferredPresetId = targetPresetId ?? (resolvedId === resolvedProviderId ? presetId : undefined);
          const resolvedPreset = await window.YUA.ai.resolveUsablePreset(resolvedId, preferredPresetId);
          if (!resolvedPreset?.id) {
            onProviderConfigChange?.(resolvedId, false);
            return false;
          }

          const secrets = (await window.YUA.ai.getPresetSecrets(resolvedPreset.id).catch(() => ({}))) as Record<string, unknown>;

          // 检查所有 required 字段是否都有值
          const allConfigured = requiredFields.every((f: any) => {
            const value = secrets[f.key];
            return value && (typeof value === 'string' ? value.trim().length > 0 : true);
          });

          onProviderConfigChange?.(resolvedId, allConfigured);
          return allConfigured;
        } catch (error) {
          console.error('检测 Provider 配置失败:', error);
          onProviderConfigChange?.(targetProviderId, false);
          return false;
        }
      },
      [availableProviders, onProviderConfigChange, presetId, providers, resolvedProviderId]
    );

    // 当选择 provider 时，检测配置状态
    useEffect(() => {
      if (resolvedProviderId && providers.length > 0) {
        checkProviderConfig(resolvedProviderId);
      }
    }, [resolvedProviderId, providers, checkProviderConfig]);

    // 打开配置窗口
    const handleOpenConfig = useCallback(
      async (targetProviderId?: string, targetPresetId?: string) => {
        const idToUse = targetProviderId || resolvedProviderId;
        if (!idToUse) return;

        const provider = resolveProviderIdentity(availableProviders, idToUse) || resolveProviderIdentity(providers, idToUse);
        if (!provider) return;

        const schema = provider.schema;
        const requiredFields = schema?.fields?.filter((f: any) => f.required) || [];
        const fields = requiredFields.map((f: any) => f.key);
        const preferredPresetId = targetPresetId ?? (idToUse === resolvedProviderId ? presetId : undefined);
        const resolvedPreset = await window.YUA.ai.resolveUsablePreset(idToUse, preferredPresetId);
        const resolvedPresetId = resolvedPreset?.id;

        if (!resolvedPresetId) {
          void window.YUA.window['window:open']('settings' as any, { category: 'ai', aiProviderId: idToUse });
          return;
        }

        if (onOpenConfig) {
          void onOpenConfig(idToUse, fields, resolvedPresetId);
          return;
        }

        void window.YUA.window['window:open']('aiProviderConfig' as any, { providerId: idToUse, presetId: resolvedPresetId, fields }, { sameDisplayAsSender: true });
      },
      [availableProviders, onOpenConfig, presetId, providers, resolvedProviderId]
    );

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        openConfig: handleOpenConfig,
        checkConfig: checkProviderConfig
      }),
      [handleOpenConfig, checkProviderConfig]
    );

    // 加载 AI Providers
    useEffect(() => {
      let mounted = true;
      (async () => {
        try {
          const provs = await window.YUA.ai.getProviders();
          if (!mounted) return;
          setProviders(provs || []);
          const visibleProviders = providerFilter ? (provs || []).filter((provider) => providerFilter(provider)) : provs || [];
          // 通知父组件 providers 已加载
          onProvidersLoaded?.(visibleProviders);
          // 默认选择第一个 provider，并优先命中 catalog 里的默认模型
          if (autoLoadFirst && visibleProviders.length > 0 && !providerId) {
            const firstProviderId = visibleProviders[0].id;
            void loadModelsForProvider(firstProviderId, { forceAutoSelect: true, provider: visibleProviders[0] });
          }
        } catch (error) {
          console.error('加载 AI Providers 失败:', error);
        }
      })();
      return () => {
        mounted = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 处理服务商和模型的选择
    const handleProviderModelSelect = useCallback(
      (selectedProviderId: string, selectedModelId: string) => {
        onChange(selectedProviderId, selectedModelId);
        const selectedCacheKey = getModelsCacheKey(selectedProviderId, selectedProviderId === resolvedProviderId ? presetId : undefined);
        if (!modelsMap[selectedCacheKey] && !loadingModels[selectedCacheKey]) {
          void loadModelsForProvider(selectedProviderId);
        }
      },
      [loadModelsForProvider, loadingModels, modelsMap, onChange, presetId, resolvedProviderId]
    );

    // 当有搜索内容时，自动加载所有服务商的模型（如果还没加载）
    useEffect(() => {
      if (searchQuery.trim()) {
        availableProviders.forEach((p) => {
          const cacheKey = getModelsCacheKey(p.id, p.id === resolvedProviderId ? presetId : undefined);
          if (!modelsMap[cacheKey] && !loadingModels[cacheKey]) {
            void loadModelsForProvider(p.id);
          }
        });
      }
    }, [searchQuery, availableProviders, modelsMap, loadingModels, loadModelsForProvider, presetId, resolvedProviderId]);

    // 搜索匹配的模型
    const searchResults = useMemo(() => {
      if (!searchQuery.trim()) {
        return [];
      }

      const query = searchQuery.trim().toLowerCase();
      const results: Array<{ provider: ProviderRow; model: ModelRow }> = [];

      availableProviders.forEach((p) => {
        const cacheKey = getModelsCacheKey(p.id, p.id === resolvedProviderId ? presetId : undefined);
        const models = filterModelsByType(modelsMap[cacheKey] || [], modelTypes);
        models.forEach((model) => {
          const modelLabel = (model.label || model.id || '').toLowerCase();
          const providerLabel = (p.label || p.id || '').toLowerCase();
          if (modelLabel.includes(query) || providerLabel.includes(query)) {
            results.push({ provider: p, model });
          }
        });
      });

      return results;
    }, [searchQuery, availableProviders, modelsMap, modelTypes, presetId, resolvedProviderId]);

    // 获取当前选中的服务商和模型信息
    const currentProvider = resolvedProvider;
    const currentModels = useMemo(() => modelsMap[currentModelsCacheKey] || [], [currentModelsCacheKey, modelsMap]);
    const currentModel = useMemo(() => currentModels.find((m) => m.id === modelId), [currentModels, modelId]);

    // 显示标签
    const displayLabel = useMemo(() => {
      if (!resolvedProviderId || !modelId) {
        return <span className="truncate text-left text-xs text-muted-foreground">{placeholder}</span>;
      }
      const modelLabel = currentModel?.label || currentModel?.id || modelId;
      const providerIcon = currentProvider?.schema?.icon;

      if (providerIcon) {
        return (
          <span className="flex items-center gap-2 truncate text-left text-xs">
            <TintableSvg src={providerIcon} className="size-4 flex-shrink-0" alt={currentProvider?.label || providerId} />
            <span className="truncate">{modelLabel}</span>
          </span>
        );
      }

      // 如果没有图标，显示服务商名称和模型名称
      const providerLabel = currentProvider?.label || resolvedProviderId;
      return <span className="truncate text-left text-xs">{`${providerLabel} · ${modelLabel}`}</span>;
    }, [resolvedProviderId, modelId, currentProvider, currentModel, placeholder, providerId]);

    const currentProviderLabel = currentProvider?.label || resolvedProviderId || providerId || '';
    const currentModelLabel = currentModel?.label || currentModel?.id || modelId || '';
    const triggerTooltip = currentProviderLabel && currentModelLabel ? `${currentProviderLabel} · ${currentModelLabel}` : placeholder;
    const triggerIcon = currentProvider?.schema?.icon ? <TintableSvg src={currentProvider.schema.icon} className="size-4 shrink-0" alt={currentProviderLabel || placeholder} /> : <TbCpu />;
    const triggerButton = (
      <Button
        variant={buttonVariant}
        size={buttonSize}
        className={triggerMode === 'icon' ? className : `flex items-center justify-between gap-2 ${className || ''}`}
        title={triggerTooltip}
        aria-label={triggerMode === 'icon' ? triggerTooltip : undefined}
        onPointerDown={() => onOpenPrepare?.()}
      >
        {triggerMode === 'icon' ? (
          triggerIcon
        ) : (
          <>
            <span className="flex items-center gap-2 flex-1 min-w-0">{displayLabel}</span>
            <TbChevronDown className="opacity-50 flex-shrink-0" />
          </>
        )}
      </Button>
    );

    useEffect(() => {
      if (!resolvedProviderId) return;
      if (modelsMap[currentModelsCacheKey] || loadingModels[currentModelsCacheKey]) return;
      void loadModelsForProvider(resolvedProviderId);
    }, [currentModelsCacheKey, loadModelsForProvider, loadingModels, modelsMap, resolvedProviderId]);

    return (
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) {
            setSearchQuery(''); // 关闭菜单时清空搜索
          }
          onOpenChange?.(open);
        }}
      >
        {triggerMode === 'icon' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{triggerTooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent side={menuSide} align={menuAlign} avoidCollisions={avoidCollisions} className="no-drag pointer-events-auto min-w-[240px]">
          {/* 搜索输入框 */}
          <div className="p-2 border-b">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索服务商或模型..."
              className="h-8 text-xs"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* 根据搜索内容显示不同内容 */}
          {searchQuery.trim() ? (
            <div className="max-h-60 overflow-auto">
              {searchResults.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">未找到匹配的模型</div>
              ) : (
                searchResults.map(({ provider, model }) => (
                  <DropdownMenuItem key={`${provider.id}:${model.id}`} onSelect={() => handleProviderModelSelect(provider.id, model.id)}>
                    <span className="flex items-center gap-2 flex-1">
                      {provider?.schema?.icon && <TintableSvg src={provider.schema.icon} className="w-4 h-4 flex-shrink-0" alt={provider.label} />}
                      <span className="truncate flex-1">{model.label || model.id}</span>
                      {model.type && modelTypes && modelTypes.length > 1 && (
                        <span className={`text-[10px] px-1 rounded border flex-shrink-0 ${typeColorClasses(model.type)}`}>{typeDisplay(model.type)}</span>
                      )}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          ) : (
            availableProviders.map((provider) => {
              const providerCacheKey = getModelsCacheKey(provider.id, provider.id === resolvedProviderId ? presetId : undefined);
              const allModels = modelsMap[providerCacheKey] || [];
              const providerModels = filterModelsByType(allModels, modelTypes);
              const isLoading = loadingModels[providerCacheKey];
              return (
                <DropdownMenuSub
                  key={provider.id}
                  onOpenChange={(open) => {
                    if (open && !modelsMap[providerCacheKey] && !loadingModels[providerCacheKey]) {
                      void loadModelsForProvider(provider.id);
                    }
                  }}
                >
                  <DropdownMenuSubTrigger>
                    <span className="flex items-center gap-2">
                      {provider?.schema?.icon && <TintableSvg src={provider.schema.icon} className="w-4 h-4" alt={provider.label} />}
                      <span>{provider.label || provider.id}</span>
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    {...(subMenuSide ? { side: subMenuSide as any } : {})}
                    avoidCollisions={avoidCollisions}
                    className={showModelDetails ? 'no-drag pointer-events-auto min-w-[320px] max-h-60 overflow-y-auto' : 'no-drag pointer-events-auto max-h-60 overflow-y-auto'}
                  >
                    {isLoading ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">加载中...</div>
                    ) : providerModels.length > 0 ? (
                      providerModels.map((model) => (
                        <DropdownMenuItem key={model.id} onSelect={() => handleProviderModelSelect(provider.id, model.id)} className={showModelDetails ? 'flex-col items-start py-2' : ''}>
                          {showModelDetails ? (
                            <div className="w-full space-y-1.5">
                              {/* 第一行：模型名称和标签 */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{model.label || model.id}</span>
                                {isFree(model) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">免费</span>}
                                {model.type && modelTypes && modelTypes.length > 1 && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeColorClasses(model.type)}`}>{typeDisplay(model.type)}</span>
                                )}
                                {renderContextPill(model)}
                              </div>
                              {/* 第二行：描述信息 */}
                              {model.description && <div className="text-xs text-muted-foreground line-clamp-2">{model.description}</div>}
                              {/* 第三行：价格信息 */}
                              {model.pricing && !isFree(model) && (
                                <div className="text-xs text-muted-foreground">
                                  {model.pricing.prompt !== undefined && model.pricing.completion !== undefined ? (
                                    <span>
                                      {model.pricing.currency === 'CNY' ? '¥' : '$'}
                                      {((model.pricing.prompt + model.pricing.completion) / 2).toFixed(4)} / {model.pricing.unit || '1K tokens'}
                                    </span>
                                  ) : model.pricing.prompt !== undefined ? (
                                    <span>
                                      {model.pricing.currency === 'CNY' ? '¥' : '$'}
                                      {model.pricing.prompt.toFixed(4)} / {model.pricing.unit || '1K tokens'}
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="flex items-center gap-2 flex-1">
                              <span className="truncate flex-1">{model.label || model.id}</span>
                              {model.type && modelTypes && modelTypes.length > 1 && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${typeColorClasses(model.type)}`}>{typeDisplay(model.type)}</span>
                              )}
                            </span>
                          )}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无模型</div>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

ProviderModelSelect.displayName = 'ProviderModelSelect';
