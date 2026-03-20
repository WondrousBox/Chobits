import { useCallback, useRef } from 'react';

import type { AICompletionCallbacks, AICompletionContext, AICompletionHandler } from '../UnifiedEditor/types';

/**
 * AI 续写配置选项
 */
export interface AICompletionOptions {
  /** AI Provider ID (如 'openai', 'anthropic' 等) */
  providerId?: string;
  /** Provider 预设 ID */
  providerPresetId?: string;
  /** Agent ID (默认 'assistant') */
  agentId?: string;
  /** 模型 ID (如 'gpt-4o', 'claude-3-sonnet' 等) */
  model?: string;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 温度 (0-1) */
  temperature?: number;
  /** 最大 tokens */
  maxTokens?: number;
}

const DEFAULT_SYSTEM_PROMPT = `你是一个专业的写作助手。用户会给你一段已经写好的文本，你需要继续这段文本的写作。
要求：
1. 保持与原文一致的写作风格和语气
2. 自然地延续原文的思路
3. 直接输出续写内容，不要添加任何解释或前缀
4. 续写内容应该在100-300字左右`;

/**
 * 创建使用 AI 模块的续写处理函数
 *
 * @param options - AI 续写配置选项
 * @returns AICompletionHandler 函数
 *
 * @example
 * ```tsx
 * import { useAICompletion } from '@/components/Editor';
 *
 * const MyEditor = () => {
 *   const handleAIComplete = useAICompletion({
 *     providerId: 'openai',
 *     model: 'gpt-4o',
 *   });
 *
 *   return (
 *     <UnifiedEditor
 *       onAIComplete={handleAIComplete}
 *     />
 *   );
 * };
 * ```
 */
export function useAICompletion(options: AICompletionOptions = {}): AICompletionHandler {
  const { providerId = 'openai', providerPresetId, agentId = 'assistant', model, systemPrompt = DEFAULT_SYSTEM_PROMPT, temperature = 0.7, maxTokens = 1000 } = options;

  const streamApiRef = useRef<{ cancel: () => void; dispose: () => void } | null>(null);

  const handleAIComplete: AICompletionHandler = useCallback(
    (context: AICompletionContext, callbacks: AICompletionCallbacks) => {
      const { text } = context;

      // 清理之前的请求
      if (streamApiRef.current) {
        streamApiRef.current.cancel();
        streamApiRef.current.dispose();
        streamApiRef.current = null;
      }

      let fullText = '';

      // 使用 window.YUA.ai.chatStream 进行流式调用
      window.YUA.ai
        .chatStream(
          {
            providerId,
            providerPresetId,
            agentId,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `请续写以下内容：\n\n${text}` }
            ],
            stream: true,
            persist: false, // 不持久化会话
            extras: {
              model,
              temperature,
              max_tokens: maxTokens
            }
          },
          (event: { type: string; data?: { text?: string; message?: { content: string } } }) => {
            switch (event.type) {
              case 'delta':
                if (event.data?.text) {
                  fullText += event.data.text;
                  callbacks.onChunk?.(event.data.text);
                }
                break;
              case 'message_completed':
                callbacks.onFinish?.(fullText);
                break;
              case 'error':
                callbacks.onError?.(new Error((event.data as { message?: string })?.message || '未知错误'));
                break;
              case 'done':
                // 流结束，如果没有调用过 onFinish，则现在调用
                if (fullText) {
                  callbacks.onFinish?.(fullText);
                }
                break;
            }
          }
        )
        .then((api: { cancel: () => void; dispose: () => void }) => {
          streamApiRef.current = api;
        })
        .catch((err: Error) => {
          callbacks.onError?.(err);
        });

      // 返回取消函数
      return () => {
        if (streamApiRef.current) {
          streamApiRef.current.cancel();
          streamApiRef.current.dispose();
          streamApiRef.current = null;
        }
      };
    },
    [providerId, providerPresetId, agentId, model, systemPrompt, temperature, maxTokens]
  );

  return handleAIComplete;
}

/**
 * 创建简单的 AI 续写处理函数（非 Hook 版本）
 * 适用于不在 React 组件中使用的场景
 *
 * @param options - AI 续写配置选项
 * @returns AICompletionHandler 函数
 */
export function createAICompletionHandler(options: AICompletionOptions = {}): AICompletionHandler {
  const { providerId = 'openai', providerPresetId, agentId = 'assistant', model, systemPrompt = DEFAULT_SYSTEM_PROMPT, temperature = 0.7, maxTokens = 1000 } = options;

  let streamApi: { cancel: () => void; dispose: () => void } | null = null;

  return (context: AICompletionContext, callbacks: AICompletionCallbacks) => {
    const { text } = context;

    // 清理之前的请求
    if (streamApi) {
      streamApi.cancel();
      streamApi.dispose();
      streamApi = null;
    }

    let fullText = '';

    window.YUA.ai
      .chatStream(
        {
          providerId,
          providerPresetId,
          agentId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `请续写以下内容：\n\n${text}` }
          ],
          stream: true,
          persist: false,
          extras: {
            model,
            temperature,
            max_tokens: maxTokens
          }
        },
        (event: { type: string; data?: { text?: string; message?: { content: string } } }) => {
          switch (event.type) {
            case 'delta':
              if (event.data?.text) {
                fullText += event.data.text;
                callbacks.onChunk?.(event.data.text);
              }
              break;
            case 'message_completed':
              callbacks.onFinish?.(fullText);
              break;
            case 'error':
              callbacks.onError?.(new Error((event.data as { message?: string })?.message || '未知错误'));
              break;
            case 'done':
              if (fullText) {
                callbacks.onFinish?.(fullText);
              }
              break;
          }
        }
      )
      .then((api: { cancel: () => void; dispose: () => void }) => {
        streamApi = api;
      })
      .catch((err: Error) => {
        callbacks.onError?.(err);
      });

    return () => {
      if (streamApi) {
        streamApi.cancel();
        streamApi.dispose();
        streamApi = null;
      }
    };
  };
}

export default useAICompletion;
