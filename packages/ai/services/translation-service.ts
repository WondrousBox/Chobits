import { type AimSegments, parser, utils } from '@aim-packages/subtitle';

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
  /** 上一段的总结内容 */
  prevSummary?: string;
  /** 任务展示信息（可选） */
  displayInfo?: {
    type?: string;
    label?: string;
    subLabel?: string;
    icon?: string;
    resourceId?: string;
  };
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
  /** 上一段的总结内容 */
  prevSummary?: string;
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
 * 分块翻译完成数据
 */
export interface TranslationChunkCompleteData {
  /** 当前分块索引 */
  chunkIndex: number;
  /** 总分块数 */
  totalChunks: number;
  /** 当前分块的开始索引 */
  startIndex: number;
  /** 当前分块的结束索引 */
  endIndex: number;
  /** 该分块翻译后的所有片段 */
  segments: AimSegments[];
  /** 该分块的总结 */
  summary?: string;
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
  /** 任务展示信息（可选） */
  displayInfo?: {
    type?: string;
    label?: string;
    subLabel?: string;
    icon?: string;
    resourceId?: string;
  };
}

/**
 * 翻译错误数据
 */
export interface TranslationErrorData {
  /** 错误消息 */
  message: string;
  /** 错误码 */
  code?: string;
  /** 当前分块索引（如果是分块翻译失败） */
  chunkIndex?: number;
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
  | { type: 'chunk-complete'; data: TranslationChunkCompleteData } // 分块翻译完成
  | { type: 'completed'; data: TranslationCompletedData } // 翻译完成
  | { type: 'error'; data: TranslationErrorData } // 翻译错误
  | { type: 'done' }; // 流程结束

/**
 * 术语表/热词条目
 */
export interface GlossaryEntry {
  /** 源语言术语（用于匹配） */
  source: string;
  /** 目标语言翻译 */
  target: string;
  /** 可选说明/上下文 */
  note?: string;
}

/**
 * 术语表类型
 * 支持多种输入格式：
 * - 数组形式: GlossaryEntry[]
 * - 对象形式: Record<string, string> (source -> target 映射)
 * - 带说明的对象: Record<string, { target: string; note?: string }>
 */
export type GlossaryInput = GlossaryEntry[] | Record<string, string> | Record<string, { target: string; note?: string }>;

/**
 * 翻译配置选项
 */
export interface TranslationOptions {
  /** 最大并发请求数，默认 3 */
  maxConcurrency?: number;
  /** 每个分块的最大字符数，默认 1000 */
  chunkSize?: number;
  /** 失败后最大重试次数，默认 2 */
  maxRetries?: number;
  /** 自定义提示词模板（可选）
   * 支持的占位符：
   * - {targetLanguage}: 目标语言
   * - {content}: 待翻译内容
   * - {context}: 上下文总结
   * - {glossary}: 匹配到的术语表条目
   */
  promptTemplate?: string;
  /** 是否要求生成 summary，默认 true */
  generateSummary?: boolean;
  /** 术语表/热词词典（可选）
   * 系统会自动从待翻译文本中提取匹配的术语，并作为翻译指导
   */
  glossary?: GlossaryInput;
}

/**
 * 流式聊天事件类型
 */
export interface ChatStreamEvent {
  type: 'delta' | 'message_completed' | 'error';
  data?: {
    text?: string;
    message?: string;
  };
}

/**
 * 流式聊天回调函数类型
 */
export type ChatStreamCallback = (event: ChatStreamEvent) => void;

/**
 * 聊天函数类型
 * 调用者需要传入一个符合此类型的函数来执行实际的 AI 调用
 */
export type ChatFunction = (
  /** 提示词内容 */
  prompt: string,
  /** 流式事件回调 */
  onEvent: ChatStreamCallback,
  /** 中止信号 */
  abortSignal?: AbortSignal
) => Promise<void>;

export interface TranslationRequest {
  /** 请求 ID（必填，用于跟踪和取消任务） */
  requestId: string;
  /** 聊天函数（必填，用于执行实际的 AI 调用） */
  chatFn: ChatFunction;
  /** 任务标签（可选，用于显示和任务管理，如 'openai/gpt-4'） */
  taskLabel?: string;
  /** 待翻译的片段数组 */
  segments: AimSegments[];
  /** 目标语言编码（如 'zh-CN', 'en', 'ja'） */
  targetLanguage: string;
  /** 语言编码到名称的映射（可选，用于提示词中显示可读名称） */
  languageNames?: Record<string, string>;
  /** 源语言编码（可选，用于指定原文语言） */
  sourceLanguage?: string;
  /** 元数据（可选，用于传递额外信息如 resourceId） */
  metadata?: Record<string, any>;
  /** 翻译配置选项 */
  options?: TranslationOptions;
}

export interface TranslationEmitter {
  (event: TranslationEvent): void;
}

/**
 * 将各种格式的术语表输入规范化为 GlossaryEntry 数组
 */
function normalizeGlossary(input: GlossaryInput): GlossaryEntry[] {
  if (Array.isArray(input)) {
    return input;
  }

  const entries: GlossaryEntry[] = [];
  for (const [source, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      entries.push({ source, target: value });
    } else {
      entries.push({ source, target: value.target, note: value.note });
    }
  }
  return entries;
}

/**
 * 从文本中提取匹配的术语表条目
 * 使用高效的匹配算法：先按长度排序，避免短词匹配覆盖长词
 * @param text 待匹配的文本
 * @param glossary 规范化后的术语表
 * @returns 匹配到的术语条目（去重）
 */
function extractMatchedGlossaryTerms(text: string, glossary: GlossaryEntry[]): GlossaryEntry[] {
  if (!glossary.length) return [];

  const matchedSet = new Set<string>();
  const matched: GlossaryEntry[] = [];

  // 转换为小写进行匹配（保留原始条目）
  const lowerText = text.toLowerCase();

  // 按 source 长度降序排列，优先匹配长词
  const sortedGlossary = [...glossary].sort((a, b) => b.source.length - a.source.length);

  for (const entry of sortedGlossary) {
    const lowerSource = entry.source.toLowerCase();

    // 检查是否已经匹配过相同的 source
    if (matchedSet.has(lowerSource)) continue;

    // 使用单词边界匹配（对于英文等空格分隔的语言更精确）
    // 对于中文等连续文字，直接使用 includes
    const hasWordBoundary = /^[a-zA-Z]/.test(entry.source);

    let isMatched = false;
    if (hasWordBoundary) {
      // 英文单词：使用正则进行单词边界匹配
      const wordPattern = new RegExp(`\\b${escapeRegExp(lowerSource)}\\b`, 'i');
      isMatched = wordPattern.test(text);
    } else {
      // 非英文（如中文、日文）：直接匹配
      isMatched = lowerText.includes(lowerSource);
    }

    if (isMatched) {
      matchedSet.add(lowerSource);
      matched.push(entry);
    }
  }

  return matched;
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 格式化匹配的术语为提示词文本
 */
function formatGlossaryForPrompt(matched: GlossaryEntry[]): string {
  if (!matched.length) return '';

  const lines = matched.map((entry) => {
    let line = `- "${entry.source}" → "${entry.target}"`;
    if (entry.note) {
      line += ` (${entry.note})`;
    }
    return line;
  });

  return `\nGlossary/Terminology guidance (please follow these translations for the specific terms):\n${lines.join('\n')}\n`;
}

interface ActiveTranslation {
  requestId: string;
  /** 任务标签（用于显示和任务管理） */
  taskLabel: string;
  startTime: number;
  controller: AbortController;
  metadata?: Record<string, any>;
  translatedSegments: AimSegments[];
}

// 存储翻译任务
const activeTranslations = new Map<string, ActiveTranslation>();

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

// 这是一个通用的LLM翻译字幕的服务，目前每次进行翻译都会先总结当前文本片段的内容，也就是说只有当前内容总结输出了之后猜忌心输出后续翻译内容。
// 然后当一段文本分组翻译完成之后才继续翻译下一段，并且带上上一段的总结作为上下文提示词，方便后续翻译的内容能够更好的理解上下文。
// 现在需要加速翻译过程，也就是说不能按照顺序一段一段翻译了，这样太慢，因此需要按照下面的思路实现：
// 1. 当前面分组的总结文本完成返回之后，就不要管前面的翻译是否完成了，可以直接用这个总结进行后续的分组翻译
// 2. 需要定义一个最大同时并行翻译请求数量，目前可以定义为3个，也就是说最多可以同时三个请求存在
// 3. 当一个分组翻译完成之后，要立即开始翻译下一个分组，并且要使用上一个分组的总结作为上下文提示词
// 4. 如果中途取消翻译，所有的翻译请求都要被中止，并且要释放资源，如果存在某一个翻译失败，需要支持自动重试两次
// 5. 我希望全部的分组翻译完成之后返回一个新的，翻译好的数组，也是 AimSegments 数组

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
   * 根据任务标签获取活跃请求
   * @param taskLabel 任务标签（如 'openai/gpt-4'）
   * @returns 活跃请求 ID 列表
   */
  getActiveRequestsByLabel(taskLabel: string): string[] {
    const requests: string[] = [];
    for (const task of activeTranslations.values()) {
      if (task.taskLabel === taskLabel) {
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
   * 获取指定任务的信息
   * @param requestId 请求 ID
   * @returns 任务信息（包含任务标签、开始时间等）
   */
  getTaskInfo(requestId: string): { taskLabel: string; startTime: number; metadata?: Record<string, any> } | null {
    const task = activeTranslations.get(requestId);
    if (!task) return null;
    return {
      taskLabel: task.taskLabel,
      startTime: task.startTime,
      metadata: task.metadata
    };
  },

  /**
   * 检查是否有正在进行的翻译任务
   * @returns 是否有活跃任务
   */
  hasActiveTranslations(): boolean {
    return activeTranslations.size > 0;
  },

  /**
   * 翻译字幕片段
   * @param request 翻译请求
   * @param emit 事件发送函数
   * @param externalSignal 外部取消信号（可选）
   * @returns 翻译完成后的片段数组
   */
  async translateSubtitles(request: TranslationRequest, emit: TranslationEmitter, externalSignal?: AbortSignal): Promise<AimSegments[]> {
    const { requestId, chatFn, taskLabel = 'translation', segments, targetLanguage, languageNames = {}, metadata, options = {} } = request;

    // 解构配置选项，使用默认值
    const { maxConcurrency = 3, chunkSize = 1000, maxRetries = 2, promptTemplate, generateSummary = true, glossary } = options;

    // 规范化术语表（如果提供）
    const normalizedGlossary = glossary ? normalizeGlossary(glossary) : [];

    // 创建并注册 AbortController
    const controller = new AbortController();
    activeTranslations.set(requestId, {
      requestId,
      taskLabel,
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

      const targetLangName = languageNames[targetLanguage] || targetLanguage;
      const abortSignal = signal; // 使用统一管理的 signal

      // 并发执行 Promise 的辅助函数（带最大并发控制）
      const runWithConcurrency = async <T>(count: number, worker: (index: number) => Promise<T>, options?: { maxConcurrency?: number; abortSignal?: AbortSignal }): Promise<T[]> => {
        const results: T[] = new Array(count);
        const { maxConcurrency = 3, abortSignal } = options || {};

        let nextIndex = 0;
        let activeCount = 0;
        let rejected = false;

        return new Promise<T[]>((resolve, reject) => {
          const maybeStartNext = (): void => {
            if (rejected) return;

            if (abortSignal?.aborted) {
              rejected = true;
              reject(new Error('Aborted'));
              return;
            }

            // 所有任务都已完成
            if (nextIndex >= count && activeCount === 0) {
              resolve(results);
              return;
            }

            // 启动新的任务直到达到并发上限
            while (activeCount < maxConcurrency && nextIndex < count && !rejected) {
              const current = nextIndex++;
              activeCount++;

              worker(current)
                .then((res) => {
                  results[current] = res;
                })
                .catch((err) => {
                  if (!rejected) {
                    rejected = true;
                    reject(err);
                  }
                })
                .finally(() => {
                  activeCount--;
                  maybeStartNext();
                });
            }
          };

          maybeStartNext();
        });
      };

      // 默认的翻译提示词（带 summary）
      const defaultPromptWithSummary = `You are a professional translator. You will always maintain the structural integrity of the '[]' positions within the sentences. The text following the '[]' must not be omitted.
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
{glossary}{context}
Now translate the following into **{targetLanguage}** and only show me the translated content:
{content}`;

      // 默认的翻译提示词（不带 summary）
      const defaultPromptWithoutSummary = `You are a professional translator. You will always maintain the structural integrity of the '[]' positions within the sentences. The text following the '[]' must not be omitted.
I will provide you with text in this format and "[number]" means the starting for each line:
[number]text
[number]text
You must keep all "[number]", Force break **translated text** reasonably to follow after "[number]". Follow the same structure:
[number]translated text
[number]translated text
{glossary}{context}
Now translate the following into **{targetLanguage}** and only show me the translated content:
{content}`;

      // 选择提示词模板
      const segmentPrompt = promptTemplate || (generateSummary ? defaultPromptWithSummary : defaultPromptWithoutSummary);

      // 任务展示信息
      const displayInfo = {
        type: 'translation',
        label: 'AI 翻译中...',
        subLabel: taskLabel,
        icon: 'translation',
        resourceId: metadata?.resourceId
      };

      // 分块处理字幕
      const chunks = utils.chunkSegmentStringsWithIndex(segments, chunkSize);
      emit({
        type: 'progress',
        data: { message: `准备翻译 ${chunks.indexStringResult.length} 个字幕片段...`, percentage: 0, displayInfo }
      });

      const totalChunks = chunks.indexStringResult.length;

      // 记录每个分块自身的 summary，避免用一个全局 lastSummary 在流式过程中被「提前覆盖」
      // key 为 chunkIndex，value 为该分块最终解析出的 summary
      const chunkSummaries: Record<number, string> = {};
      const allParsedSegments: any[] = [];

      // 为「某个分块的 summary 已准备好」建立等待/通知机制
      const summaryWaiters = new Map<number, Array<() => void>>();

      const notifySummaryReady = (index: number): void => {
        const waiters = summaryWaiters.get(index);
        if (waiters && waiters.length > 0) {
          waiters.forEach((fn) => fn());
          summaryWaiters.delete(index);
        }
      };

      const waitForSummary = (index: number): Promise<void> => {
        if (index < 0) return Promise.resolve();
        if (chunkSummaries[index] !== undefined) {
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          const list = summaryWaiters.get(index) || [];
          list.push(resolve);
          summaryWaiters.set(index, list);
        });
      };

      const MAX_RETRIES = maxRetries;

      // 单个分块的翻译逻辑：
      // 1. 等待上一分块 summary 完成
      // 2. 使用上一分块 summary 作为上下文提示词
      // 3. 流式解析 & 事件
      // 4. 失败自动重试两次
      const translateChunk = async (chunkIndex: number, attempt: number = 0): Promise<string> => {
        if (abortSignal?.aborted) {
          throw new Error('Aborted');
        }

        const chunk = chunks.indexStringResult[chunkIndex];

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

        // 等待上一分块的 summary 完成后再启动当前分块（chunkIndex 为 0 则无需等待）
        // 如果不需要生成 summary，则无需等待
        if (chunkIndex > 0 && generateSummary) {
          await waitForSummary(chunkIndex - 1);
        }

        if (abortSignal?.aborted) {
          throw new Error('Aborted');
        }

        const prevSummary = chunkIndex > 0 ? chunkSummaries[chunkIndex - 1] || '' : '';

        emit({
          type: 'chunk-start',
          data: {
            chunkIndex,
            totalChunks,
            previousSegments: allParsedSegments,
            startIndex,
            endIndex,
            prevSummary: prevSummary || undefined
          }
        });

        // 进度应该是基于已经完成的片段数，而不是当前分块的结束位置
        const percentage = Math.round((startIndex / segments.length) * 100);

        emit({
          type: 'progress',
          data: {
            message: `正在翻译片段 ${chunkIndex + 1}/${totalChunks}...`,
            startIndex,
            endIndex,
            percentage,
            displayInfo,
            prevSummary: prevSummary || undefined
          }
        });

        let prompt = segmentPrompt.replace(/{targetLanguage}/g, targetLangName).replace(/{content}/g, chunk);

        // 从当前分块文本中提取匹配的术语
        const matchedTerms = normalizedGlossary.length > 0 ? extractMatchedGlossaryTerms(chunk, normalizedGlossary) : [];
        const glossaryPromptText = formatGlossaryForPrompt(matchedTerms);
        prompt = prompt.replace('{glossary}', glossaryPromptText);

        if (prevSummary && generateSummary) {
          prompt = prompt.replace('{context}', `\nContext from previous part:\n${prevSummary}\n`);
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
                    message: `正在翻译片段 ${chunkIndex + 1}/${totalChunks}...`,
                    percentage: newPercentage,
                    displayInfo,
                    prevSummary: prevSummary || undefined
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
                // 记录当前分块的 summary，供后续分块作为「上一分块总结」使用
                chunkSummaries[chunkIndex] = summaryContent;
                notifySummaryReady(chunkIndex);
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

        try {
          // 调用传入的 chatFn 进行流式翻译
          await chatFn(
            prompt,
            (event) => {
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
        } catch (error) {
          // 如果被外部中止，则直接抛出
          if (abortSignal?.aborted) {
            throw new Error('Aborted');
          }

          // 自动重试，最多 2 次
          if (attempt < MAX_RETRIES) {
            emit({
              type: 'progress',
              data: {
                message: `分块 ${chunkIndex + 1}/${totalChunks} 翻译失败，正在重试 (${attempt + 1}/${MAX_RETRIES})...`,
                displayInfo
              }
            });
            return translateChunk(chunkIndex, attempt + 1);
          }

          // 超过重试次数，抛出最终错误
          throw error instanceof Error ? error : new Error(String(error));
        }

        allParsedSegments.push(...currentChunkSegments);

        // 更新任务中的已翻译片段
        const task = activeTranslations.get(requestId);
        if (task) {
          task.translatedSegments = [...allParsedSegments];
        }

        // 发送 chunk-complete 事件，包含该 chunk 的所有翻译结果
        emit({
          type: 'chunk-complete',
          data: {
            chunkIndex,
            totalChunks,
            startIndex,
            endIndex,
            segments: currentChunkSegments,
            summary: summaryContent || undefined
          }
        });

        if (!currentTranslation) {
          throw new Error('翻译结果为空');
        }

        return currentTranslation;
      };

      // 带并发的分块翻译调度
      emit({ type: 'progress', data: { message: '正在连接AI服务...', percentage: 0 } });
      const allTranslations = await runWithConcurrency<string>(totalChunks, (index) => translateChunk(index), {
        maxConcurrency,
        abortSignal
      });

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

      // 返回翻译完成的片段
      return allParsedSegments;
    } catch (error) {
      // 发送错误事件
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage !== 'Aborted') {
        emit({ type: 'error', data: { message: errorMessage } });
      }
      throw error;
    } finally {
      // 清理 controller
      activeTranslations.delete(requestId);
    }
  }
};
