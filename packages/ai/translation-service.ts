import { type AimSegments, parser, utils } from '@aim-packages/subtitle';

import { getProvider } from './registry';
import { getAllSecrets } from './settings-store';

// 在这边实现一个翻译函数，目的是用AI来翻译用户传过来的大批量的文本片段，片段的类型已经定义在 AimSegments ，我的思路就是先将这些片段分组，拿到符合长度限制的各个分组之后，再进行翻译。
// 所以涉及到几个问题：
// 1. 要解决不同分组的顺序执行
// 2. 每个分组在翻译完成之后会得到一个总结，所以我需要将这个总结放到下一个分组的片段的提示词里面，方便保留上下文的理解能力
// 3. 开始每个分组翻译之前，要发送一个分组开始的消息，这个用来发送之前的所有分组翻译出来的内容
// 4. 如果有上一个分组发送过来的总结内容，要带到下一个分组的提示词里面，方便下一个分组可以理解并更好的翻译
// 5. 我希望全部的分组翻译完成之后返回一个新的，翻译好的数组，也是 AimSegments 数组

// 我认为这个翻译服务还要进一步优化，一个用户可能对多个字幕同时执行翻译。
// 那就意味着，如果使用单个服务商进行翻译很容易导致达到限流状态，所以有可能需要提醒当前用户正在使用的服务商翻译时存在正在翻译中的内容，这样用户可以确认是否更换一个
// 当用户更换后的翻译服务商没有正在翻译内容时，可以立即开始翻译。
// 当然如果用户一定要使用当前服务商进行翻译，也不是不可以，但是这种情况就需要额外的参数强制启动翻译。
// 因此我需要实现几个能力：
// 1. 要能够记录每个翻译请求ID采用的是什么翻译服务和模型
// 2. 要能够查询当服务商是否有正在翻译的请求，并且也要返回正在翻译中的请求ID列表
// 3. 要能够启动多个翻译服务商并进行管理
// 4. 要能够取消某个翻译请求，并且实现翻译服务商的中止释放能力
// 5. 要能够在翻译之前返回通知说存在占用的情况，等用户确定是否继续

// 对应的，在渲染进程要实现：
// 1. 记录最近五次使用的翻译服务和模型，方便用户快速选择，记录的时候要不能记录重复的服务商，并且要把最新使用的放在最前面
// 2. 提供一个继续使用配置和更换配置的选项给用户选择

/**
 * 翻译进度数据
 */
export interface TranslationProgressData {
  /** 进度消息 */
  message: string;
  /** 进度百分比 (0-100) */
  percentage?: number;
  /** 当前处理的片段开始索引 */
  startIndex?: number;
  /** 当前处理的片段结束索引 */
  endIndex?: number;
}

/**
 * 分块翻译开始数据
 */
export interface TranslationChunkStartData {
  /** 当前分块索引 */
  chunkIndex: number;
  /** 总分块数 */
  totalChunks: number;
  /** 之前已翻译完成的片段 */
  previousSegments: AimSegments[];
  /** 当前分块的开始索引 */
  startIndex: number;
  /** 当前分块的结束索引 */
  endIndex: number;
}

/**
 * 翻译总结数据
 */
export interface TranslationSummaryData {
  /** 当前分块索引 */
  chunkIndex: number;
  /** 总结内容 */
  summary: string;
  /** 当前分块的开始索引 */
  startIndex: number;
  /** 当前分块的结束索引 */
  endIndex: number;
}

/**
 * 翻译完成数据
 */
export interface TranslationCompletedData {
  /** 所有翻译结果文本数组 */
  translations: string[];
  /** 合并后的原始翻译文本 */
  originalTranslation: string;
  /** 解析后的所有片段 */
  segments: AimSegments[];
}

/**
 * 翻译事件类型
 */
export type TranslationEvent =
  | { type: 'connected' } // 连接成功
  | { type: 'progress'; data: TranslationProgressData } // 进度更新
  | { type: 'chunk-start'; data: TranslationChunkStartData } // 分块开始
  | { type: 'parsed'; data: AimSegments[] } // 解析出新的片段
  | { type: 'parseProgress'; data: AimSegments[] } // 解析进度
  | { type: 'summary'; data: TranslationSummaryData } // 获得总结
  | { type: 'completed'; data: TranslationCompletedData } // 翻译完成
  | { type: 'done' }; // 流程结束

export interface TranslationRequest {
  requestId: string;
  providerId: string;
  model: string;
  segments: AimSegments[];
  targetLanguage: string;
  languageNames: Record<string, string>;
  force?: boolean;
  metadata?: Record<string, any>;
}

export interface TranslationEmitter {
  (event: TranslationEvent): void;
}

interface ActiveTranslation {
  requestId: string;
  providerId: string;
  model: string;
  startTime: number;
  controller: AbortController;
  metadata?: Record<string, any>;
  translatedSegments: AimSegments[];
}

// 存储翻译任务
const activeTranslations = new Map<string, ActiveTranslation>();

export const TranslationService = {
  /**
   * 获取所有活跃的翻译任务
   * @returns 活跃任务列表
   */
  getAllActiveTranslations(): ActiveTranslation[] {
    return Array.from(activeTranslations.values());
  },

  /**
   * 获取指定任务已翻译的片段
   * @param requestId 请求 ID
   * @returns 已翻译的片段列表
   */
  getTranslatedSegments(requestId: string): AimSegments[] {
    const task = activeTranslations.get(requestId);
    return task?.translatedSegments || [];
  },

  /**
   * 获取服务商当前的活跃请求
   * @param providerId 服务商 ID
   * @returns 活跃请求 ID 列表
   */
  getProviderActiveRequests(providerId: string): string[] {
    const requests: string[] = [];
    for (const task of activeTranslations.values()) {
      if (task.providerId === providerId) {
        requests.push(task.requestId);
      }
    }
    return requests;
  },

  /**
   * 取消翻译任务
   * @param requestId 请求 ID
   * @returns 是否成功取消
   */
  cancelTranslation(requestId: string): boolean {
    const task = activeTranslations.get(requestId);
    if (task) {
      task.controller.abort();
      // Do not delete immediately; let the task cleanup itself in finally block
      // activeTranslations.delete(requestId);
      return true;
    }
    return false;
  },

  /**
   * 翻译字幕
   * @param request 翻译请求
   * @param emit 事件发送函数
   * @param externalSignal 外部取消信号（可选）
   */
  async translateSubtitles(request: TranslationRequest, emit: TranslationEmitter, externalSignal?: AbortSignal): Promise<void> {
    const { requestId, providerId, model, segments, targetLanguage, languageNames, force, metadata } = request;

    // 检查服务商是否繁忙
    const activeRequests = this.getProviderActiveRequests(providerId);
    if (activeRequests.length > 0 && !force) {
      throw new Error(`BUSY:${activeRequests.join(',')}`);
    }

    // 创建并注册 AbortController
    const controller = new AbortController();
    activeTranslations.set(requestId, {
      requestId,
      providerId,
      model,
      startTime: Date.now(),
      controller,
      metadata,
      translatedSegments: []
    });

    // 如果提供了外部信号，当外部信号中止时也中止内部控制器
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller.abort());
      }
    }

    const signal = controller.signal;

    try {
      emit({ type: 'connected' });
      emit({ type: 'progress', data: { message: '准备翻译...', percentage: 0 } });

      const provider = getProvider(providerId);
      if (!provider || !provider.chat) {
        throw new Error(`Provider ${providerId} not found or does not support chat`);
      }

      // 确保 secrets 已加载
      const schema = provider.getConfigSchema?.();
      const keys = (schema?.fields || []).map((f) => f.key);
      const secrets = await getAllSecrets(providerId, keys);
      if (Object.keys(secrets).length > 0 && provider.setSecrets) {
        await Promise.resolve(provider.setSecrets(secrets));
      }

      const targetLangName = languageNames[targetLanguage] || targetLanguage;
      // const ctrl = signal ? undefined : new AbortController(); // 已废弃，使用统一的 signal
      const abortSignal = signal; // 使用统一管理的 signal

      // 按顺序执行 Promise 的辅助函数
      const executePromisesInOrder = async <T>(promises: Array<() => Promise<T>>, abortSignal?: AbortSignal, timeout?: number): Promise<T[]> => {
        const results: T[] = [];

        for (let i = 0; i < promises.length; i++) {
          if (abortSignal?.aborted) {
            throw new Error('Aborted');
          }

          try {
            const promise = promises[i]();
            const result = timeout ? await Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))]) : await promise;
            results.push(result);
          } catch (error) {
            throw error instanceof Error ? error : new Error(String(error));
          }
        }

        return results;
      };

      // 默认的翻译提示词
      const defaultSegmentPrompt = `You are a professional translator. You will always maintain the structural integrity of the '[]' positions within the sentences. The text following the '[]' must not be omitted.
I will provide you with text in this format and "[number]" means the starting for each line:
[number]text
[number]text
You must keep all "[number]", Force break **translated text** reasonably to follow after "[number]". Follow the same structure:
<summary>Summary of the provided text</summary>
[number]translated text
[number]translated text

Make sure the following:
- the summary is guiding the following translated text, should be concise and to the point, no need to be too detailed
- the summary should be placed at the beginning of the translated text in <> mark
- the translated text is in the format of [number]translated text
{context}
Now translate the following into **{targetLanguage}** and only show me the translated content:
{content}`;

      // 任务展示信息
      const displayInfo = {
        type: 'translation',
        label: 'AI 翻译中...',
        subLabel: `${providerId} · ${model}`,
        icon: 'translation',
        resourceId: metadata?.resourceId
      };

      // 分块处理字幕
      const chunks = utils.chunkSegmentStringsWithIndex(segments, 1000);
      emit({ type: 'progress', data: { message: `准备翻译 ${chunks.indexStringResult.length} 个字幕片段...`, percentage: 0, displayInfo } });

      let lastSummary = '';
      const allParsedSegments: any[] = [];

      // 创建翻译 Promise 数组
      const translatePromises = chunks.indexStringResult.map((chunk: string, chunkIndex: number) => {
        return async (): Promise<string> => {
          if (abortSignal?.aborted) {
            throw new Error('Aborted');
          }

          // 从 chunk 字符串中提取开始和结束索引
          const extractIndexRange = (chunkText: string): { startIndex: number; endIndex: number } => {
            const indexPattern = /\[(\d+)\]/g;
            const matches = Array.from(chunkText.matchAll(indexPattern));
            if (matches.length === 0) {
              return { startIndex: -1, endIndex: -1 };
            }
            const indices = matches.map((m) => parseInt(m[1], 10));
            return {
              startIndex: Math.min(...indices),
              endIndex: Math.max(...indices)
            };
          };

          const { startIndex, endIndex } = extractIndexRange(chunk);

          emit({
            type: 'chunk-start',
            data: {
              chunkIndex,
              totalChunks: chunks.indexStringResult.length,
              previousSegments: allParsedSegments,
              startIndex,
              endIndex
            }
          });

          // 进度应该是基于已经完成的片段数，而不是当前分块的结束位置
          const percentage = Math.round((startIndex / segments.length) * 100);

          emit({
            type: 'progress',
            data: {
              message: `正在翻译片段 ${chunkIndex + 1}/${chunks.indexStringResult.length}...`,
              startIndex,
              endIndex,
              percentage,
              displayInfo
            }
          });

          let prompt = defaultSegmentPrompt.replace(/{targetLanguage}/g, targetLangName).replace(/{content}/g, chunk);

          if (lastSummary) {
            prompt = prompt.replace('{context}', `\nContext from previous part:\n${lastSummary}\n`);
          } else {
            prompt = prompt.replace('{context}', '');
          }

          let currentTranslation = '';

          // 用于处理 summary 标签的状态
          let accumulatedText = ''; // 累积所有接收到的文本
          let processedLength = 0; // 已经处理过的文本长度（用于跟踪已发送给 parser 的文本）
          let summaryExtracted = false;
          let summaryContent = ''; // 保存当前 chunk 的 summary

          const currentChunkSegments: any[] = [];

          // 为每个 chunk 创建独立的 parser
          const translateParser = parser.createTranslateStreamParser({
            onParse: (event) => {
              if (event.type === 'event' && event.event === 'message') {
                if (event.data) {
                  // 将 summaryContent、startIndex 和 endIndex 添加到 data 中
                  const dataWithMetadata = event.data.map((item: any) => ({
                    ...item,
                    summary: summaryContent,
                    startIndex,
                    endIndex
                  }));

                  currentChunkSegments.push(...dataWithMetadata);

                  // 实时更新任务中的已翻译片段，包含当前 chunk 已解析的部分
                  const task = activeTranslations.get(requestId);
                  if (task) {
                    task.translatedSegments = [...allParsedSegments, ...currentChunkSegments];
                  }

                  emit({
                    type: 'parsed',
                    data: dataWithMetadata
                  });

                  // 实时更新进度
                  const currentTotal = allParsedSegments.length + currentChunkSegments.length;
                  const newPercentage = Math.round((currentTotal / segments.length) * 100);
                  emit({
                    type: 'progress',
                    data: {
                      message: `正在翻译片段 ${chunkIndex + 1}/${chunks.indexStringResult.length}...`,
                      percentage: newPercentage,
                      displayInfo
                    }
                  });
                }
              }
            },
            onProgress: (event) => {
              if (event.data) {
                // 将 summaryContent、startIndex 和 endIndex 添加到 data 中
                const dataWithMetadata = event.data.map((item: any) => ({
                  ...item,
                  summary: summaryContent,
                  startIndex,
                  endIndex
                }));

                emit({
                  type: 'parseProgress',
                  data: dataWithMetadata
                });
              }
            }
          });

          // 处理 summary 标签的辅助函数
          const processTextWithSummary = (deltaText: string): string => {
            if (summaryExtracted) {
              return deltaText;
            }

            // 累积新的 delta 文本
            accumulatedText += deltaText;

            // 如果还没有提取 summary，检测是否有完整的 summary 标签
            if (!summaryExtracted) {
              const summaryStartIndex = accumulatedText.indexOf('<summary>');
              if (summaryStartIndex !== -1) {
                // 找到了开始标签，检查是否有结束标签
                const textAfterStart = accumulatedText.substring(summaryStartIndex + '<summary>'.length);
                const summaryEndIndex = textAfterStart.indexOf('</summary>');

                if (summaryEndIndex !== -1) {
                  // 找到了完整的 summary 标签
                  summaryContent = textAfterStart.substring(0, summaryEndIndex).trim();
                  lastSummary = summaryContent;
                  const textAfterEnd = textAfterStart.substring(summaryEndIndex + '</summary>'.length);
                  summaryExtracted = true;

                  // 发送 summary 事件
                  emit({
                    type: 'summary',
                    data: {
                      chunkIndex,
                      summary: summaryContent,
                      startIndex,
                      endIndex
                    }
                  });

                  // 释放内存
                  accumulatedText = '';

                  // 返回 summary 标签之后的新内容（如果有）
                  if (textAfterEnd) {
                    return textAfterEnd;
                  }
                  return '';
                } else {
                  // 还没有结束标签，继续等待（不返回任何内容给 parser）
                  return '';
                }
              } else {
                // 还没有找到完整的 summary 标签，检查是否可能正在形成中
                // 检查是否有部分 summary 开始标签（可能被分割）
                const possibleStartPatterns = ['<summ', '<summa', '<summar', '<summari', '<summary'];
                let mightBeForming = false;

                // 检查最后几个字符是否可能是 summary 标签的开始
                for (const pattern of possibleStartPatterns) {
                  if (accumulatedText.endsWith(pattern) || accumulatedText.includes('<' + pattern.substring(1))) {
                    mightBeForming = true;
                    break;
                  }
                }

                if (mightBeForming) {
                  // 可能正在形成 summary 标签，继续等待
                  return '';
                }

                // 没有 summary 标签，返回新接收到的 delta（从上次处理的位置开始）
                const newText = accumulatedText.substring(processedLength);
                processedLength = accumulatedText.length;
                return newText;
              }
            }

            return '';
          };

          // 调用 provider 的 chat 方法进行流式翻译
          await provider?.chat?.(
            {
              messages: [{ role: 'user', content: prompt }],
              providerId,
              extras: { model, secrets },
              stream: true,
              abortId: `${requestId}-chunk-${chunkIndex}`
            },
            (event: any) => {
              if (event?.type === 'delta' && event.data?.text) {
                const deltaText = event.data.text;
                // 处理 summary 标签
                const textToFeed = processTextWithSummary(deltaText);

                // 如果有内容需要 feed 给 parser
                if (textToFeed) {
                  translateParser.feed(textToFeed);
                }

                currentTranslation += deltaText;
              } else if (event?.type === 'message_completed') {
                translateParser.end();
              } else if (event?.type === 'error') {
                throw new Error(event.data?.message || '翻译失败');
              }
            },
            abortSignal
          );

          allParsedSegments.push(...currentChunkSegments);

          // 更新任务中的已翻译片段
          const task = activeTranslations.get(requestId);
          if (task) {
            task.translatedSegments = [...allParsedSegments];
          }

          if (!currentTranslation) {
            throw new Error('翻译结果为空');
          }

          return currentTranslation;
        };
      });

      // 按顺序执行翻译请求
      emit({ type: 'progress', data: { message: '正在连接AI服务...', percentage: 0 } });
      const allTranslations = await executePromisesInOrder(translatePromises, abortSignal);

      emit({ type: 'progress', data: { message: '翻译完成，正在解析结果...', percentage: 100, displayInfo } });

      emit({
        type: 'completed',
        data: {
          translations: allTranslations,
          originalTranslation: allTranslations.join('\n'),
          segments: allParsedSegments,
          displayInfo
        }
      });

      emit({ type: 'done' });
    } finally {
      // 清理 controller
      activeTranslations.delete(requestId);
    }
  }
};
