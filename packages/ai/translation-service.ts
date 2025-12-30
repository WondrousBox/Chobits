import { type AimSegments, parser, utils } from '@aim-packages/subtitle';

import { getProvider } from './registry';
import { getAllSecrets } from './settings-store';

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

    const translateParser = parser.createTranslateStreamParser({
      onParse: (event) => {
        if (event.type === 'event' && event.event === 'message') {
          if (event.data) {
            // example { index: 5, text: '让他生气，或者让他伤心。事实上，我们甚至能把他变成一位\n' }
            console.log('onParse', event.data);
            // 可以在这里发送解析到的事件
            emit({
              type: 'parsed',
              data: event.data
            });
          }
        }
      },
      onProgress: (event) => {
        if (event.data) {
          console.log('onProgress', event.data);
          // 可以在这里发送进度事件
          emit({
            type: 'parseProgress',
            data: event.data
          });
        }
      }
    });

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

        emit({
          type: 'progress',
          data: { message: `正在翻译片段 ${chunkIndex + 1}/${chunks.indexStringResult.length}...` }
        });

        const prompt = defaultSegmentPrompt.replace(/{targetLanguage}/g, targetLangName).replace(/{content}/g, chunk);

        let currentTranslation = '';

        // 用于处理 summary 标签的状态
        let summaryBuffer = '';
        let isInSummary = false;
        let summaryExtracted = false;

        // 处理 summary 标签的辅助函数
        const processTextWithSummary = (text: string): string => {
          let remainingText = text;

          // 如果还没有开始提取 summary，检测是否有开始标签
          if (!summaryExtracted && !isInSummary) {
            const summaryStartIndex = remainingText.indexOf('<summary>');
            if (summaryStartIndex !== -1) {
              isInSummary = true;
              const textAfterStart = remainingText.substring(summaryStartIndex + '<summary>'.length);
              remainingText = remainingText.substring(0, summaryStartIndex);

              // 检查是否在同一段文本中就有结束标签
              const summaryEndIndex = textAfterStart.indexOf('</summary>');
              if (summaryEndIndex !== -1) {
                const summaryContent = textAfterStart.substring(0, summaryEndIndex);
                const textAfterEnd = textAfterStart.substring(summaryEndIndex + '</summary>'.length);
                isInSummary = false;
                summaryExtracted = true;

                // 发送 summary 事件
                emit({
                  type: 'summary',
                  data: {
                    chunkIndex,
                    summary: summaryContent.trim()
                  }
                });

                // 返回 summary 标签之后的内容
                return textAfterEnd;
              } else {
                // 没有结束标签，先累积到 buffer
                summaryBuffer = textAfterStart;
                return '';
              }
            } else {
              // 没有 summary 标签，直接返回
              return remainingText;
            }
          }

          // 如果正在提取 summary
          if (isInSummary) {
            const combinedText = summaryBuffer + remainingText;
            const summaryEndIndex = combinedText.indexOf('</summary>');
            if (summaryEndIndex !== -1) {
              const summaryContent = combinedText.substring(0, summaryEndIndex);
              const textAfterEnd = combinedText.substring(summaryEndIndex + '</summary>'.length);
              summaryBuffer = '';
              isInSummary = false;
              summaryExtracted = true;

              // 发送 summary 事件
              emit({
                type: 'summary',
                data: {
                  chunkIndex,
                  summary: summaryContent.trim()
                }
              });

              // 返回 summary 标签之后的内容
              return textAfterEnd;
            } else {
              // 还没有结束标签，继续累积
              summaryBuffer = combinedText;
              return '';
            }
          }

          // 已经提取过 summary，直接返回
          return remainingText;
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
