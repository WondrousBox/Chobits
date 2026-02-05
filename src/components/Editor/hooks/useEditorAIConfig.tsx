/**
 * EditorAIConfig - 编辑器 AI 配置组件
 *
 * 在编辑器工具栏上显示一个 AI 设置按钮，点击后可以选择 AI 提供商和模型。
 * 选择后会自动更新 AI 续写功能使用的配置。
 */
import { useCallback, useMemo, useState } from 'react';
import { TbSparkles } from 'react-icons/tb';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import type { AICompletionHandler } from '../UnifiedEditor/types';
import type { AICompletionOptions } from './useAICompletion';
import { createAICompletionHandler } from './useAICompletion';

// 本地存储的 key
const STORAGE_KEY_PROVIDER = 'editor.ai.providerId';
const STORAGE_KEY_MODEL = 'editor.ai.modelId';

export interface EditorAIConfigProps {
  /** 默认的 AI 提供商 ID */
  defaultProviderId?: string;
  /** 默认的模型 ID */
  defaultModelId?: string;
  /** 是否持久化配置到 localStorage */
  persist?: boolean;
  /** 当配置变化时的回调 */
  onConfigChange?: (config: { providerId: string; modelId: string }) => void;
  /** 额外的 AI 配置选项 */
  aiOptions?: Omit<AICompletionOptions, 'providerId' | 'model'>;
}

export interface EditorAIConfigResult {
  /** AI 续写处理函数 */
  handleAIComplete: AICompletionHandler | undefined;
  /** 工具栏右侧的 AI 配置组件 */
  AIConfigComponent: React.ReactNode;
  /** 当前选中的提供商 ID */
  providerId: string;
  /** 当前选中的模型 ID */
  modelId: string;
  /** 手动设置配置 */
  setConfig: (providerId: string, modelId: string) => void;
}

/**
 * 使用编辑器 AI 配置的 Hook
 *
 * @example
 * ```tsx
 * const { handleAIComplete, AIConfigComponent } = useEditorAIConfig({
 *   defaultProviderId: 'deepseek',
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
  const { defaultProviderId = '', defaultModelId = '', persist = true, onConfigChange, aiOptions = {} } = props;

  // 从 localStorage 读取持久化的配置
  const [providerId, setProviderId] = useState<string>(() => {
    if (persist) {
      const saved = localStorage.getItem(STORAGE_KEY_PROVIDER);
      if (saved) return saved;
    }
    return defaultProviderId;
  });

  const [modelId, setModelId] = useState<string>(() => {
    if (persist) {
      const saved = localStorage.getItem(STORAGE_KEY_MODEL);
      if (saved) return saved;
    }
    return defaultModelId;
  });

  // 创建 AI 续写处理函数 - 使用 useMemo 避免在 effect 中调用 setState
  const handleAIComplete = useMemo<AICompletionHandler | undefined>(() => {
    if (providerId && modelId) {
      return createAICompletionHandler({
        providerId,
        model: modelId,
        ...aiOptions
      });
    }
    return undefined;
  }, [providerId, modelId, aiOptions]);

  // 处理配置变化
  const handleChange = useCallback(
    (newProviderId: string, newModelId: string) => {
      setProviderId(newProviderId);
      setModelId(newModelId);

      // 持久化到 localStorage
      if (persist) {
        localStorage.setItem(STORAGE_KEY_PROVIDER, newProviderId);
        localStorage.setItem(STORAGE_KEY_MODEL, newModelId);
      }

      // 通知父组件
      onConfigChange?.({ providerId: newProviderId, modelId: newModelId });
    },
    [persist, onConfigChange]
  );

  // 手动设置配置
  const setConfig = useCallback(
    (newProviderId: string, newModelId: string) => {
      handleChange(newProviderId, newModelId);
    },
    [handleChange]
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
              modelId={modelId}
              onChange={handleChange}
              placeholder="选择 AI 模型"
              buttonVariant="ghost"
              buttonSize="sm"
              className="h-7 px-2 text-xs"
              modelTypes={['chat']}
              autoLoadFirst={false}
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
    modelId,
    setConfig
  };
}

export default useEditorAIConfig;
