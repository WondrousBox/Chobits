import { type AimSegments, parser, utils } from '@aim-packages/subtitle';

import { getProvider } from './registry';
import { getAllSecrets } from './settings-store';

// 我在这边实现一个翻译函数，目的是用AI来翻译用户传过来的大批量的文本片段，片段的类型已经定义在 AimSegments ，我的思路就是先将这些片段分组，拿到符合长度限制的各个分组之后，再进行翻译。

// 所以涉及到几个问题：
// 1. 要解决不同分组的顺序执行
// 2. 每个分组在翻译完成之后会得到一个总结，所以我需要将这个总结放到下一个分组的片段的提示词里面，方便保留上下文的理解能力
// 3. 开始每个分组翻译之前，要发送一个开始翻译的消息，这个用来通过网页可以展示当前翻译的片段是到哪里了
// 4. 当获得每个翻译分组预选得到的总结信息时，也要把这个信息发送一个消息，这个可以用来在网页端展示实时效果
// 5. 如果有上一个分组发送过来的总结内容，要带到下一个分组的提示词里面，方便下一个分组可以理解并更好的翻译
// 6. 我希望全部的分组翻译完成之后返回一个新的，翻译好的数组，也是 AimSegments数组

export interface TranslationRequest {
  requestId: string;
  providerId: string;
  model: string;
  segments: AimSegments[];
  targetLanguage: string;
  languageNames: Record<string, string>;
}

export interface TranslationEmitter {
  (event: { type: string; data?: any }): void;
}

export const TranslationService = {
  /**
   * 翻译字幕
   * @param request 翻译请求
   * @param emit 事件发送函数
   * @param signal 取消信号
   */
  async translateSubtitles(request: TranslationRequest, emit: TranslationEmitter, signal?: AbortSignal): Promise<void> {
    const { requestId, providerId, model, segments, targetLanguage, languageNames } = request;

    emit({ type: 'connected' });
    emit({ type: 'progress', data: { message: '准备翻译...' } });

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
    const ctrl = signal ? undefined : new AbortController();
    const abortSignal = signal || ctrl?.signal;

    // 按顺序执行 Promise 的辅助函数
    const executePromisesInOrder = async <T>(promises: Array<() => Promise<T>>, abortSignal?: AbortSignal, timeout?: number): Promise<Array<{ result?: T; error?: Error }>> => {
      const results: Array<{ result?: T; error?: Error }> = [];

      for (let i = 0; i < promises.length; i++) {
        if (abortSignal?.aborted) {
          results.push({ error: new Error('Aborted') });
          break;
        }

        try {
          const promise = promises[i]();
          const result = timeout ? await Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))]) : await promise;
          results.push({ result });
        } catch (error) {
          results.push({ error: error instanceof Error ? error : new Error(String(error)) });
          // 如果出错，可以选择继续或停止
          // 这里选择继续执行后续请求
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

Now translate the following into **{targetLanguage}** and only show me the translated content:
{content}`;

    // 分块处理字幕
    const chunks = utils.chunkSegmentStringsWithIndex(segments, 1000);
    emit({ type: 'progress', data: { message: `准备翻译 ${chunks.indexStringResult.length} 个字幕片段...` } });

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
          type: 'progress',
          data: {
            message: `正在翻译片段 ${chunkIndex + 1}/${chunks.indexStringResult.length}...`,
            startIndex,
            endIndex
          }
        });

        const prompt = defaultSegmentPrompt.replace(/{targetLanguage}/g, targetLangName).replace(/{content}/g, chunk);

        let currentTranslation = '';

        // 用于处理 summary 标签的状态
        let accumulatedText = ''; // 累积所有接收到的文本
        let processedLength = 0; // 已经处理过的文本长度（用于跟踪已发送给 parser 的文本）
        let summaryExtracted = false;
        let summaryContent = ''; // 保存当前 chunk 的 summary

        // 为每个 chunk 创建独立的 parser
        const translateParser = parser.createTranslateStreamParser({
          onParse: (event) => {
            if (event.type === 'event' && event.event === 'message') {
              if (event.data) {
                // 将 summaryContent、startIndex 和 endIndex 添加到 data 中
                const dataWithMetadata = Array.isArray(event.data)
                  ? event.data.map((item: any) => ({
                    ...item,
                    summary: summaryContent,
                    startIndex,
                    endIndex
                  }))
                  : [
                    {
                      ...event.data,
                      summary: summaryContent,
                      startIndex,
                      endIndex
                    }
                  ];

                emit({
                  type: 'parsed',
                  data: dataWithMetadata
                });
              }
            }
          },
          onProgress: (event) => {
            if (event.data) {
              // 将 summaryContent、startIndex 和 endIndex 添加到 data 中
              const dataWithMetadata = Array.isArray(event.data)
                ? event.data.map((item: any) => ({
                  ...item,
                  summary: summaryContent,
                  startIndex,
                  endIndex
                }))
                : [
                  {
                    ...event.data,
                    summary: summaryContent,
                    startIndex,
                    endIndex
                  }
                ];

              emit({
                type: 'parseProgress',
                data: dataWithMetadata
              });
            }
          }
        });

        // 处理 summary 标签的辅助函数
        const processTextWithSummary = (deltaText: string): string => {
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
                const textAfterEnd = textAfterStart.substring(summaryEndIndex + '</summary>'.length);
                summaryExtracted = true;

                console.log('summaryContent', summaryContent);

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

                // 更新累积文本为 summary 标签之后的内容
                accumulatedText = textAfterEnd;
                // 重置已处理长度，因为 summary 标签之前的内容都不需要给 parser
                processedLength = 0;

                // 返回 summary 标签之后的新内容（如果有）
                if (textAfterEnd) {
                  processedLength = textAfterEnd.length;
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

          // 已经提取过 summary，返回新接收到的 delta
          const newText = accumulatedText.substring(processedLength);
          processedLength = accumulatedText.length;
          return newText;
        };

        // 调用 provider 的 chat 方法进行流式翻译
        const response = await provider?.chat?.(
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
              console.log('message_completed', event.data);
            } else if (event?.type === 'error') {
              throw new Error(event.data?.message || '翻译失败');
            }
          },
          abortSignal
        );

        if (!currentTranslation) {
          throw new Error('翻译结果为空');
        }

        return currentTranslation;
      };
    });

    // 按顺序执行翻译请求
    emit({ type: 'progress', data: { message: '正在连接AI服务...' } });
    await executePromisesInOrder(translatePromises, abortSignal);

    // 处理结果并合并
    const allTranslations: string[] = [];
    const errors: Error[] = [];

    if (errors.length > 0 && allTranslations.length === 0) {
      throw new Error(`翻译失败: ${errors[0].message}`);
    }

    emit({ type: 'progress', data: { message: '翻译完成，正在解析结果...' } });

    emit({
      type: 'completed',
      data: {
        translations: allTranslations,
        originalTranslation: allTranslations.join('\n')
      }
    });

    emit({ type: 'done' });
  }
};

// 先在在开始翻译之前，都会发送开始翻译的消息，
// 翻译过程中还会实时发送翻译的内容和所在的字幕index，以及当前翻译的行数和所在的片段的开始和结束位置，还有当前的片段总结信息
// 当翻译完成之后，会发送翻译完成的消息，并返回翻译好的数组
// 我想要实现这些消息发送到字幕播放组件 asrplayer中时，那边监听这些消息并展示对应的UI效果：
// 1. 我希望正在翻译中的片段要有对应的颜色展示，并且要禁止用户修改
// 2. 我希望新翻译出来的片段要有对应的颜色展示，等到全部翻译完成之后才恢复原样
// 3. 我希望当前的片段总结信息要展示在片段的旁边，说明当前片段在AI的眼中是站在什么角度去翻译的
// 4. 我希望翻译过程中的打字效果要展示出来，就像AI在打字一样
