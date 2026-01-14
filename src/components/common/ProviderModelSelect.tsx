import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { TbChevronDown } from 'react-icons/tb';

import TintableSvg from '@/components/common/TintableSvg';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

// 支持的模型类型
export type ModelType = 'chat' | 'embedding' | 'audio' | 'image' | 'tooling' | 'video' | 'vision' | 'realtime' | 'tool' | string;

// 暴露给父组件的方法
export interface ProviderModelSelectRef {
  openConfig: (providerId?: string) => void;
  checkConfig: (providerId: string) => Promise<boolean>;
}

export interface ProviderModelSelectProps {
  providerId?: string;
  modelId?: string;
  onChange: (providerId: string, modelId: string) => void;
  placeholder?: string;
  buttonVariant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  // 是否自动加载第一个provider的模型
  autoLoadFirst?: boolean;
  // 当菜单打开/关闭时的回调
  onOpenChange?: (open: boolean) => void;
  // 筛选的模型类型（数组），如果为空则不筛选
  modelTypes?: ModelType[];
  // 是否在二级菜单中显示模型的详细信息（描述、价格、是否免费、上下文大小等）
  showModelDetails?: boolean;
  // 当 providers 加载完成时的回调，用于向父组件传递 providers 数据
  onProvidersLoaded?: (providers: any[]) => void;
  // 当 provider 配置状态变化时的回调
  onProviderConfigChange?: (providerId: string, isConfigured: boolean) => void;
  // 当需要打开配置窗口时的回调，传入 providerId 和需要配置的字段
  onOpenConfig?: (providerId: string, requiredFields: string[]) => void;
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

export const ProviderModelSelect = forwardRef<ProviderModelSelectRef, ProviderModelSelectProps>(
  (
    {
      providerId,
      modelId,
      onChange,
      placeholder = '选择服务商 · 模型',
      buttonVariant = 'outline',
      buttonSize = 'sm',
      className,
      autoLoadFirst = true,
      onOpenChange,
      modelTypes,
      showModelDetails = false,
      onProvidersLoaded,
      onProviderConfigChange,
      onOpenConfig
    },
    ref
  ) => {
    const [providers, setProviders] = useState<any[]>([]);
    const [modelsMap, setModelsMap] = useState<Record<string, any[]>>({});
    const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState<string>('');

    // 加载指定provider的模型列表
    const loadModelsForProvider = useCallback(
      async (targetProviderId: string) => {
        if (modelsMap[targetProviderId] || loadingModels[targetProviderId]) {
          return; // 已经加载过或正在加载
        }

        setLoadingModels((prev) => ({ ...prev, [targetProviderId]: true }));
        try {
          const modelList = await window.YUA.ai.listModels(targetProviderId);
          setModelsMap((prev) => ({ ...prev, [targetProviderId]: modelList || [] }));
          // 如果这是当前选中的provider，自动选择第一个符合条件的模型
          if (targetProviderId === providerId && modelList && modelList.length > 0 && !modelId) {
            const filteredModels = filterModelsByType(modelList, modelTypes);
            if (filteredModels.length > 0) {
              onChange(targetProviderId, filteredModels[0].id);
            } else if (modelList.length > 0) {
              // 如果没有符合条件的模型，选择第一个模型（用于向后兼容）
              onChange(targetProviderId, modelList[0].id);
            }
          }
        } catch (error) {
          console.error(`加载 ${targetProviderId} 的模型列表失败:`, error);
          setModelsMap((prev) => ({ ...prev, [targetProviderId]: [] }));
        } finally {
          setLoadingModels((prev) => {
            const next = { ...prev };
            delete next[targetProviderId];
            return next;
          });
        }
      },
      [modelsMap, loadingModels, providerId, modelId, onChange, modelTypes]
    );

    // 检测 Provider 配置状态
    const checkProviderConfig = useCallback(
      async (targetProviderId: string): Promise<boolean> => {
        if (!targetProviderId) {
          onProviderConfigChange?.('', false);
          return false;
        }

        try {
          const provider = providers.find((p) => p.id === targetProviderId);
          if (!provider) {
            onProviderConfigChange?.(targetProviderId, false);
            return false;
          }

          // 获取 provider 的 schema，检查 required 字段
          const schema = provider.schema;
          const requiredFields = schema?.fields?.filter((f: any) => f.required) || [];

          if (requiredFields.length === 0) {
            // 如果没有 required 字段，认为已配置
            onProviderConfigChange?.(targetProviderId, true);
            return true;
          }

          // 获取已配置的 secrets
          const secrets = await window.YUA.ai.getProviderSecrets(targetProviderId).catch(() => ({}));

          // 检查所有 required 字段是否都有值
          const allConfigured = requiredFields.every((f: any) => {
            const value = secrets[f.key];
            return value && (typeof value === 'string' ? value.trim().length > 0 : true);
          });

          onProviderConfigChange?.(targetProviderId, allConfigured);
          return allConfigured;
        } catch (error) {
          console.error('检测 Provider 配置失败:', error);
          onProviderConfigChange?.(targetProviderId, false);
          return false;
        }
      },
      [providers, onProviderConfigChange]
    );

    // 当选择 provider 时，检测配置状态
    useEffect(() => {
      if (providerId && providers.length > 0) {
        checkProviderConfig(providerId);
      }
    }, [providerId, providers, checkProviderConfig]);

    // 打开配置窗口
    const handleOpenConfig = useCallback(
      async (targetProviderId?: string) => {
        const idToUse = targetProviderId || providerId;
        if (!idToUse) return;

        const provider = providers.find((p) => p.id === idToUse);
        if (!provider) return;

        const schema = provider.schema;
        const requiredFields = schema?.fields?.filter((f: any) => f.required) || [];
        const fields = requiredFields.map((f: any) => f.key);

        onOpenConfig?.(idToUse, fields);
      },
      [providers, onOpenConfig, providerId]
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
          // 通知父组件 providers 已加载
          onProvidersLoaded?.(provs || []);
          // 默认选择第一个provider并加载模型
          if (autoLoadFirst && provs && provs.length > 0 && !providerId) {
            const firstProviderId = provs[0].id;
            if (!modelsMap[firstProviderId] && !loadingModels[firstProviderId]) {
              loadModelsForProvider(firstProviderId);
            }
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
        // 如果该服务商的模型还没有加载，先加载
        if (!modelsMap[selectedProviderId] && !loadingModels[selectedProviderId]) {
          loadModelsForProvider(selectedProviderId);
        }
      },
      [modelsMap, loadingModels, loadModelsForProvider, onChange]
    );

    // 当有搜索内容时，自动加载所有服务商的模型（如果还没加载）
    useEffect(() => {
      if (searchQuery.trim()) {
        providers.forEach((p) => {
          if (!modelsMap[p.id] && !loadingModels[p.id]) {
            loadModelsForProvider(p.id);
          }
        });
      }
    }, [searchQuery, providers, modelsMap, loadingModels, loadModelsForProvider]);

    // 搜索匹配的模型
    const searchResults = useMemo(() => {
      if (!searchQuery.trim()) {
        return [];
      }

      const query = searchQuery.trim().toLowerCase();
      const results: Array<{ provider: any; model: any }> = [];

      providers.forEach((p) => {
        const models = filterModelsByType(modelsMap[p.id] || [], modelTypes);
        models.forEach((model) => {
          const modelLabel = (model.label || model.id || '').toLowerCase();
          const providerLabel = (p.label || p.id || '').toLowerCase();
          if (modelLabel.includes(query) || providerLabel.includes(query)) {
            results.push({ provider: p, model });
          }
        });
      });

      return results;
    }, [searchQuery, providers, modelsMap, modelTypes]);

    // 获取当前选中的服务商和模型信息
    const currentProvider = useMemo(() => providers.find((p) => p.id === providerId), [providers, providerId]);
    const currentModels = useMemo(() => modelsMap[providerId || ''] || [], [modelsMap, providerId]);
    const currentModel = useMemo(() => currentModels.find((m) => m.id === modelId), [currentModels, modelId]);

    // 显示标签
    const displayLabel = useMemo(() => {
      if (!providerId || !modelId) {
        return <span className="truncate text-left text-xs text-muted-foreground">{placeholder}</span>;
      }
      const modelLabel = currentModel?.label || currentModel?.id || modelId;
      const providerIcon = currentProvider?.schema?.icon;

      if (providerIcon) {
        return (
          <span className="flex items-center gap-2 truncate text-left text-xs">
            <TintableSvg src={providerIcon} className="w-4 h-4 flex-shrink-0" alt={currentProvider?.label || providerId} />
            <span className="truncate">{modelLabel}</span>
          </span>
        );
      }

      // 如果没有图标，显示服务商名称和模型名称
      const providerLabel = currentProvider?.label || providerId;
      return <span className="truncate text-left text-xs">{`${providerLabel} · ${modelLabel}`}</span>;
    }, [providerId, modelId, currentProvider, currentModel, placeholder]);

    return (
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) {
            setSearchQuery(''); // 关闭菜单时清空搜索
          }
          onOpenChange?.(open);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button variant={buttonVariant} size={buttonSize} className={`flex items-center justify-between gap-2 ${className || ''}`}>
            <span className="flex items-center gap-2 flex-1 min-w-0">{displayLabel}</span>
            <TbChevronDown className="w-4 h-4 opacity-50 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[240px]">
          {/* 搜索输入框 */}
          <div className="p-2 border-b">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索模型..."
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
            providers.map((provider) => {
              const allModels = modelsMap[provider.id] || [];
              const providerModels = filterModelsByType(allModels, modelTypes);
              const isLoading = loadingModels[provider.id];
              return (
                <DropdownMenuSub
                  key={provider.id}
                  onOpenChange={(open) => {
                    if (open && !modelsMap[provider.id] && !loadingModels[provider.id]) {
                      loadModelsForProvider(provider.id);
                    }
                  }}
                >
                  <DropdownMenuSubTrigger>
                    <span className="flex items-center gap-2">
                      {provider?.schema?.icon && <TintableSvg src={provider.schema.icon} className="w-4 h-4" alt={provider.label} />}
                      <span>{provider.label || provider.id}</span>
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className={showModelDetails ? 'min-w-[320px] max-h-60 overflow-y-auto' : 'max-h-60 overflow-y-auto'}>
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
