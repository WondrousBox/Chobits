/**
 * EditorAIConfig - 编辑器 AI 配置组件
 *
 * 在编辑器工具栏上显示一个 AI 设置按钮，点击后可以选择 AI 模型。
 * 选择后会自动更新 AI 续写功能使用的配置。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TbSparkles } from 'react-icons/tb';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { resolveModelFirstSelection } from '@/lib/ai-model-first';

import type { AICompletionHandler } from '../UnifiedEditor/types';
import type { AICompletionOptions } from './useAICompletion';
import { createAICompletionHandler } from './useAICompletion';

// 本地存储的 key
const STORAGE_KEY_PROVIDER = 'editor.ai.providerId';
const STORAGE_KEY_PRESET = 'editor.ai.providerPresetId';
const STORAGE_KEY_MODEL = 'editor.ai.modelId';

export interface EditorAIConfigProps {
  /** 默认的 AI 提供商 ID */
  defaultProviderId?: string;
  /** 默认的预设 ID（作为隐藏偏好保留） */
  defaultPresetId?: string;
  /** 默认的模型 ID */
  defaultModelId?: string;
  /** 是否持久化配置到 localStorage */
  persist?: boolean;
  /** 当配置变化时的回调 */
  onConfigChange?: (config: { providerId: string; providerPresetId: string; modelId: string }) => void;
  /** 额外的 AI 配置选项 */
  aiOptions?: Omit<AICompletionOptions, 'providerId' | 'providerPresetId' | 'model'>;
}

export interface EditorAIConfigResult {
  /** AI 续写处理函数 */
  handleAIComplete: AICompletionHandler | undefined;
  /** 工具栏右侧的 AI 配置组件 */
  AIConfigComponent: React.ReactNode;
  /** 当前选中的提供商 ID */
  providerId: string;
  /** 当前选中的隐藏预设 ID */
  providerPresetId: string;
  /** 当前选中的模型 ID */
  modelId: string;
  /** 手动设置配置 */
  setConfig: (providerId: string, modelId: string, providerPresetId?: string) => void;
}

/**
 * 使用编辑器 AI 配置的 Hook
 *
 * @example
 * ```tsx
 * const { handleAIComplete, AIConfigComponent } = useEditorAIConfig({
 *   defaultProviderId: 'deepseek',
 *   defaultModelId: 'deepseek-chat',
 *   persist: true,
 * });
 *
 * return (
 *   <UnifiedEditor
 *     onAIComplete={handleAIComplete}
 *     toolbarRight={AIConfigComponent}
 *   />
 * );
 * ```
 */
export function useEditorAIConfig(props: EditorAIConfigProps = {}): EditorAIConfigResult {
  const { defaultProviderId = '', defaultPresetId = '', defaultModelId = '', persist = true, onConfigChange, aiOptions = {} } = props;

  // 从 localStorage 读取持久化的配置
  const [providerId, setProviderId] = useState<string>(() => {
    if (persist) {
      const saved = localStorage.getItem(STORAGE_KEY_PROVIDER);
      if (saved) return saved;
    }
    return defaultProviderId;
  });

  const [providerPresetId, setProviderPresetId] = useState<string>(() => {
    if (persist) {
      const saved = localStorage.getItem(STORAGE_KEY_PRESET);
      if (saved) return saved;
    }
    return defaultPresetId;
  });

  const [modelId, setModelId] = useState<string>(() => {
    if (persist) {
      const saved = localStorage.getItem(STORAGE_KEY_MODEL);
      if (saved) return saved;
    }
    return defaultModelId;
  });

  // 在选择 provider + model 后，异步解析一个可用的隐藏 preset。
  useEffect(() => {
    let disposed = false;

    if (!providerId || !modelId) {
      if (providerPresetId) {
        setProviderPresetId('');
      }
      if (persist) {
        localStorage.removeItem(STORAGE_KEY_PRESET);
      }
      return () => {
        disposed = true;
      };
    }

    void (async () => {
      const resolvedSelection = await resolveModelFirstSelection({
        providerId,
        modelId,
        preferredPresetId: providerPresetId
      });

      if (disposed) {
        return;
      }

      const nextPresetId = resolvedSelection?.providerPresetId || '';
      if (nextPresetId !== providerPresetId) {
        setProviderPresetId(nextPresetId);
      }

      if (persist) {
        if (nextPresetId) {
          localStorage.setItem(STORAGE_KEY_PRESET, nextPresetId);
        } else {
          localStorage.removeItem(STORAGE_KEY_PRESET);
        }
      }

      onConfigChange?.({
        providerId,
        providerPresetId: nextPresetId,
        modelId
      });
    })().catch((error) => {
      console.error('解析编辑器 AI 隐藏预设失败:', error);
    });

    return () => {
      disposed = true;
    };
  }, [modelId, onConfigChange, persist, providerId, providerPresetId]);

  // 创建 AI 续写处理函数
  const handleAIComplete = useMemo<AICompletionHandler | undefined>(() => {
    if (providerId && modelId) {
      return createAICompletionHandler({
        providerId,
        providerPresetId: providerPresetId || undefined,
        model: modelId,
        ...aiOptions
      });
    }
    return undefined;
  }, [aiOptions, modelId, providerId, providerPresetId]);

  const persistSelection = useCallback(
    (nextProviderId: string, nextModelId: string, nextPresetId?: string) => {
      if (!persist) {
        return;
      }

      localStorage.setItem(STORAGE_KEY_PROVIDER, nextProviderId);
      localStorage.setItem(STORAGE_KEY_MODEL, nextModelId);

      if (nextPresetId) {
        localStorage.setItem(STORAGE_KEY_PRESET, nextPresetId);
      } else {
        localStorage.removeItem(STORAGE_KEY_PRESET);
      }
    },
    [persist]
  );

  // 处理配置变化
  const handleChange = useCallback(
    (newProviderId: string, newModelId: string) => {
      const shouldClearPreset = !!providerId && providerId !== newProviderId;
      const nextPresetId = shouldClearPreset ? '' : providerPresetId;

      setProviderId(newProviderId);
      setModelId(newModelId);
      if (shouldClearPreset) {
        setProviderPresetId('');
      }

      persistSelection(newProviderId, newModelId, nextPresetId);
    },
    [persistSelection, providerId, providerPresetId]
  );

  // 手动设置配置
  const setConfig = useCallback(
    (newProviderId: string, newModelId: string, newProviderPresetId = '') => {
      setProviderId(newProviderId);
      setModelId(newModelId);
      setProviderPresetId(newProviderPresetId);
      persistSelection(newProviderId, newModelId, newProviderPresetId);
      onConfigChange?.({
        providerId: newProviderId,
        providerPresetId: newProviderPresetId,
        modelId: newModelId
      });
    },
    [onConfigChange, persistSelection]
  );

  // 工具栏右侧的 AI 配置组件
  const AIConfigComponent = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <TbSparkles className="h-4 w-4 text-primary" />
            <ProviderModelSelect
              providerId={providerId}
              presetId={providerPresetId}
              modelId={modelId}
              onChange={handleChange}
              placeholder="选择 AI 模型"
              buttonVariant="ghost"
              buttonSize="sm"
              className="h-7 px-2 text-xs"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>选择用于 AI 续写的模型</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return {
    handleAIComplete,
    AIConfigComponent,
    providerId,
    providerPresetId,
    modelId,
    setConfig
  };
}

export default useEditorAIConfig;
