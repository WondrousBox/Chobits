import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

// 动态导入 sherpa-onnx-node，支持开发环境和打包后的环境
let sherpa_onnx;

function log(text) {
  if (process.send) {
    process.send({
      event: 'log',
      data: '[child] ' + text
    });
  } else {
    console.log('[child]', text);
  }
}

// 尝试导入模块的辅助函数
async function tryImportModule(modulePath, possibleEntries = []) {
  // 优先尝试 sherpa-onnx.js，这是 ESM 模块的正确入口
  const entries = possibleEntries.length > 0 ? possibleEntries : ['/sherpa-onnx.js', '/index.js'];

  for (const entry of entries) {
    try {
      const fullPath = path.join(modulePath, entry);
      // 检查文件是否存在
      if (!fs.existsSync(fullPath)) {
        continue;
      }
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      return { success: true, module, path: fullPath };
    } catch (e) {
      // 继续尝试下一个入口
      log(`[asr] Failed to import ${path.join(modulePath, entry)}: ${e.message}`);
    }
  }
  return { success: false };
}

try {
  if (process.env.SHERPA_ONNX_NODE_PATH) {
    // 使用环境变量传递的完整路径（打包后的环境）
    const modulePath = path.resolve(process.env.SHERPA_ONNX_NODE_PATH);
    log(`[asr] Loading sherpa-onnx-node from: ${modulePath}`);

    const result = await tryImportModule(modulePath);
    if (result.success) {
      // 处理 CommonJS 模块的 default 导出
      sherpa_onnx = result.module.default || result.module;
      log(`[asr] sherpa-onnx-node loaded successfully from: ${result.path}`);
    } else {
      throw new Error(`Failed to load sherpa-onnx-node from ${modulePath}`);
    }
  } else {
    // 开发环境：尝试从当前目录的 node_modules 导入
    try {
      log('[asr] Attempting to load sherpa-onnx-node from node_modules...');
      const imported = await import('sherpa-onnx-node');
      // 处理 CommonJS 模块的 default 导出
      sherpa_onnx = imported.default || imported;
      log('[asr] sherpa-onnx-node loaded successfully from node_modules');
    } catch (error) {
      log(`[asr] Failed to load from node_modules: ${error.message}`);
      // 如果失败，尝试从可能的路径导入
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const possiblePaths = [
        path.resolve(__dirname, '../../node_modules/sherpa-onnx-node'),
        path.resolve(__dirname, '../../../node_modules/sherpa-onnx-node'),
        path.resolve(process.cwd(), 'node_modules/sherpa-onnx-node')
      ];

      log(`[asr] Trying alternative paths: ${possiblePaths.join(', ')}`);
      let loaded = false;
      for (const modulePath of possiblePaths) {
        const result = await tryImportModule(modulePath);
        if (result.success) {
          // 处理 CommonJS 模块的 default 导出
          sherpa_onnx = result.module.default || result.module;
          log(`[asr] sherpa-onnx-node loaded successfully from: ${result.path}`);
          loaded = true;
          break;
        } else {
          log(`[asr] Failed to load from ${modulePath}`);
        }
      }

      if (!loaded) {
        throw new Error(`Cannot find sherpa-onnx-node module. Tried: ${possiblePaths.join(', ')}`);
      }
    }
  }
} catch (error) {
  log(`[asr] Fatal error loading sherpa-onnx-node: ${error.message}`);
  log(`[asr] Stack: ${error.stack}`);
  throw error;
}

let recognizer;
let stream;
// let display;
let punctuation;

let duration = 0;
let lastText = '';

let firstReceivedTime = undefined;

// 用于累积发送的句子管理
let sentSegmentsCount = 0; // 已经作为"确定"发送出去的句子数量
let sentText = ''; // 已经发送出去的文本内容
let sentTokensCount = 0; // 已经发送出去的 tokens 数量

// 配置：累积多少句话后，前面的句子作为确定的内容发送
const AUTO_SEND_THRESHOLD = 3; // 累积超过3句时，自动发送前面的句子

/**
 * 检测文本是否主要由CJK字符组成
 * @param {string} text - 要检测的文本
 * @returns {boolean} 是否主要是CJK字符
 */
function isCJKText(text) {
  const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
  const cjkMatches = text.match(cjkRegex) || [];
  const alphaRegex = /[a-zA-Z]/g;
  const alphaMatches = text.match(alphaRegex) || [];

  // 如果CJK字符数量大于等于字母数量，认为是CJK文本
  return cjkMatches.length >= alphaMatches.length;
}

/**
 * 根据标点符号拆分识别结果
 * @param {string} originalText - 原始无标点文本
 * @param {string} punctuatedText - 带标点的文本
 * @param {string[]} tokens - token数组
 * @param {number[]} timestamps - 时间戳数组
 * @param {number} startTime - 开始时间（秒）
 * @param {Object} options - 配置选项
 * @param {number} options.minCJKLength - CJK文本最短句子长度，默认5
 * @param {number} options.minAlphaLength - 字母文本最短句子长度，默认15
 * @returns {Array} 拆分后的结果数组
 */
function splitByPunctuation(originalText, punctuatedText, tokens, timestamps, startTime, options = {}) {
  const { minCJKLength = 20, minAlphaLength = 30 } = options;

  // 强制分段的标点符号（句号、问号、感叹号、分号、省略号等）
  const strongPunctuationRegex = /[。.！？!?；;…]/;
  // 弱标点符号（逗号、冒号等）- 需要结合长度判断
  // 注意：顿号「、」不参与分段，因为顿号表示并列关系，句子应保持连续
  const weakPunctuationRegex = /[，,：:]/;
  // 所有标点符号（用于识别标点，但不一定都会触发分段）
  const allPunctuationRegex = /[，。！？,.!?；;：:、…]/;

  // 如果没有tokens或timestamps，返回简单结果
  if (!tokens || tokens.length === 0 || !timestamps || timestamps.length === 0) {
    return [
      {
        text: punctuatedText,
        tokens: tokens || [],
        timestamps: timestamps || [],
        punctuation: null,
        start_time: startTime
      }
    ];
  }

  // 移除标点符号得到纯文本，用于与原始文本对比
  const textWithoutPunct = punctuatedText.replace(/[，。！？,.!?；;：:、…]/g, '');

  // 如果没有标点符号，直接返回原始结果
  if (textWithoutPunct === punctuatedText) {
    return [
      {
        text: punctuatedText,
        tokens: tokens,
        timestamps: timestamps,
        punctuation: null,
        start_time: startTime
      }
    ];
  }

  const results = [];
  let currentSegment = {
    text: '',
    tokens: [],
    timestamps: [],
    punctuation: null,
    start_time: startTime
  };

  // 将tokens连接成文本，并建立字符到token索引的映射
  let tokenTexts = tokens.map((t) => t.trim().toLowerCase());
  let tokenStartPositions = []; // 每个token在连接文本中的起始位置
  let joinedTokenText = '';

  for (let i = 0; i < tokenTexts.length; i++) {
    tokenStartPositions.push(joinedTokenText.length);
    joinedTokenText += tokenTexts[i];
  }

  // 找到每个字符对应的token索引
  function findTokenIndexForPosition(pos) {
    for (let i = tokenStartPositions.length - 1; i >= 0; i--) {
      if (pos >= tokenStartPositions[i]) {
        return i;
      }
    }
    return 0;
  }

  // 遍历带标点的文本，按标点拆分
  let charIndexInOriginal = 0; // 在原始文本（不含标点）中的位置
  let lastTokenIndex = -1;

  for (let i = 0; i < punctuatedText.length; i++) {
    const char = punctuatedText[i];

    // 顿号不参与分段判断，直接加入文本
    if (char === '、') {
      currentSegment.text += char;
      continue;
    }

    if (allPunctuationRegex.test(char)) {
      // 检测当前段落文本是否主要是CJK
      const currentText = currentSegment.text.trim();
      const isCJK = isCJKText(currentText);
      const minLength = isCJK ? minCJKLength : minAlphaLength;

      // 计算当前段落的有效字符长度（不含空格）
      const effectiveLength = currentText.replace(/\s/g, '').length;

      // 判断是否应该在此处分段
      const isStrongPunctuation = strongPunctuationRegex.test(char);
      const isWeakPunctuation = weakPunctuationRegex.test(char);

      // 强标点直接分段，弱标点需要长度足够才分段
      const shouldSplit = isStrongPunctuation || (isWeakPunctuation && effectiveLength >= minLength);

      if (shouldSplit) {
        // 遇到强标点符号，或弱标点且长度足够，结束当前段落
        currentSegment.punctuation = char;
        currentSegment.text = currentText;

        if (currentSegment.text.length > 0 || currentSegment.tokens.length > 0) {
          results.push(currentSegment);
        }

        // 开始新段落
        const nextStartTime = currentSegment.timestamps.length > 0 ? currentSegment.timestamps[currentSegment.timestamps.length - 1] + startTime : startTime;

        currentSegment = {
          text: '',
          tokens: [],
          timestamps: [],
          punctuation: null,
          start_time: nextStartTime
        };
        lastTokenIndex = -1;
      } else {
        // 弱标点但长度不够，将标点符号也加入当前段落文本
        currentSegment.text += char;
      }
    } else {
      // 普通字符
      currentSegment.text += char;

      // 找到对应的token
      if (char !== ' ') {
        const tokenIndex = findTokenIndexForPosition(charIndexInOriginal);

        // 如果是新的token，添加到当前段落
        if (tokenIndex !== lastTokenIndex && tokenIndex < tokens.length) {
          currentSegment.tokens.push(tokens[tokenIndex]);
          currentSegment.timestamps.push(timestamps[tokenIndex]);
          lastTokenIndex = tokenIndex;
        }

        charIndexInOriginal++;
      }
    }
  }

  // 处理最后一个段落（如果有内容）
  currentSegment.text = currentSegment.text.trim();
  if (currentSegment.text.length > 0 || currentSegment.tokens.length > 0) {
    results.push(currentSegment);
  }

  return results;
}

function setupASR(config) {
  recognizer = new sherpa_onnx.OnlineRecognizer(config.modelConfig);

  if (config.punctuationModelConfig) {
    log('[asr] use punctuation');
    log(JSON.stringify(config.punctuationModelConfig, null, 2));

    if (!sherpa_onnx.OnlinePunctuation) {
      log('[asr] ERROR: OnlinePunctuation is not available in sherpa_onnx');
      throw new Error('OnlinePunctuation is not available in sherpa-onnx-node module');
    }

    if (typeof sherpa_onnx.OnlinePunctuation !== 'function') {
      log('[asr] ERROR: OnlinePunctuation is not a constructor function');
      throw new Error('OnlinePunctuation is not a constructor function');
    }

    punctuation = config.punctuationModelConfig.model.ctTransformer
      ? new sherpa_onnx.OfflinePunctuation(config.punctuationModelConfig)
      : new sherpa_onnx.OnlinePunctuation(config.punctuationModelConfig);
  }
  stream = recognizer.createStream();
  // display = new sherpa_onnx.Display(50);
  log('[asr] started');
  log(JSON.stringify(config.modelConfig, null, 2));
  process.send({
    event: 'started',
    data: config
  });
}

// 16kHz float32 samples
function sendData(samples) {
  // Calculate duration in seconds
  duration += Math.round((samples.length / recognizer.config.featConfig.sampleRate) * 1000);

  stream.acceptWaveform({ sampleRate: recognizer.config.featConfig.sampleRate, samples });

  while (recognizer.isReady(stream)) {
    recognizer.decode(stream);
  }

  const isEndpoint = recognizer.isEndpoint(stream);

  const result = recognizer.getResult(stream);

  /**
    这个是sherpa-onnx-node的子进程代码，用来启动语音识别asr的能力。
    每当有内容被识别之后就会返回注释中的这段结构，里面有开始时间和每个字符token的时间戳。
    而且这里面还会启动punctuation来进行标点符号预测
    如果开启了标点符号预测，那么最终返回的文本会被标记上标点符号
    每次识别可能都有30秒左右的文本，在这期间都没有出发任何endpoint，直到识别秒数结束。然后会开启下一段音频的流式识别。
    但是在每段30秒左右的文本中，可能已经被标点符号预测了很多逗号和句号。我需要：
    1. 只要检测到标点符号预测出来了，就要把这些文本按照标点符号拆分的效果拆分成多个数组，并且时间戳也一起拆分
    2. 每个数组之间还要将预测的表单符号放进去，类似于[
      {text: '带标点的文本', tokens: [], timestamps: [], punctuation},
      {text: '带标点的文本', tokens: [], timestamps: [], punctuation},
    ]
    3. 最后将个组数复制给result，自定一个名称，比如叫result_with_punctuation
    
    返回的数据结构
    {
      text: ' THIS IS SAM',
      tokens: [ ' THIS', ' IS', ' SA', 'M' ],
      timestamps: [ 0.96, 1.16, 1.44, 1.56 ],
      ys_probs: [],
      lm_probs: [],
      context_scores: [],
      segment: 0,
      words: [ 176496, 89394, 153540 ],
      start_time: 102.4,
      is_final: false,
      is_eof: false
    }

  // console.log(result);
  */

  // 我发现如果我把enableEndpoint设置为false，或者把rule3MinUtteranceLength设置为很长时，
  // 会发现，在很长时间内，语音识别都不会触发isEndpoint，我的识别断句会累积得越来越多，
  // 因此我希望当累积到一定的量的时候，前面已经断句好的片段可以当做isEndpoint模式发送出去了。
  // 我觉得累计了有5句左右的情况下，前面的句子基本不会变化了，所以就当做直接发送的内容就行。
  // 然后以后的标点预测或者断句就要把这部分内容先剔除，要做好这个剔除操作，别产生计算错误

  // 当累积到一定量的句子后，前面已经断句好的片段作为确定内容发送
  // 这样可以在 enableEndpoint 设为 false 或 rule3MinUtteranceLength 很长时，仍然能及时输出结果
  if (isEndpoint) {
    if (result.text.length > 0) {
      const text = result.text.toLowerCase().trim();
      const punctuatedText = punctuation ? punctuation.addPunct(text) : text;

      // 根据标点符号拆分结果
      const resultWithPunctuation = splitByPunctuation(text, punctuatedText, result.tokens, result.timestamps, result.start_time);

      // display.print(segmentIndex, text);
      process.send({
        event: 'asr:progress',
        data: {
          start: firstReceivedTime !== undefined ? firstReceivedTime : result.start_time * 1000,
          end: duration,
          // timestamp: Math.round((result.timestamps[result.timestamps.length - 1] + result.start_time) * 1000),
          text: punctuatedText,
          isEndpoint,
          result_with_punctuation: resultWithPunctuation
        }
      });
    }
    lastText = '';
    firstReceivedTime = undefined;
    // 重置累积发送的状态
    sentSegmentsCount = 0;
    sentText = '';
    sentTokensCount = 0;
    recognizer.reset(stream);
  } else {
    if (result.text.length > 0) {
      if (result.timestamps.length === 0 && result.start_time === 0 && firstReceivedTime === undefined) {
        firstReceivedTime = duration;
      }
      const rawText = result.text.toLowerCase().trim();

      // 只有当原始文本变化时才处理标点和发送更新，避免重复计算
      if (rawText !== lastText) {
        lastText = rawText; // 保存原始文本用于下次比较

        // 优化：只对未发送的部分进行标点预测，减少内存占用和计算量
        // 从已发送的 tokens 数量开始截取未发送的部分
        const remainingTokens = result.tokens.slice(sentTokensCount);
        const remainingTimestamps = result.timestamps.slice(sentTokensCount);

        // 计算未发送部分的文本（从 tokens 拼接得到）
        // 注意：result.text 是完整文本，需要根据已发送的 tokens 来截取
        const sentTokensText = result.tokens.slice(0, sentTokensCount).join('').replace(/\s+/g, ' ').trim();
        let remainingRawText = rawText;
        if (sentTokensCount > 0 && sentTokensText.length > 0) {
          // 从原始文本中移除已发送的部分
          // 使用 tokens 来精确计算已发送文本的长度
          const sentTextNormalized = sentTokensText.toLowerCase();
          const startIndex = rawText.toLowerCase().indexOf(sentTextNormalized);
          if (startIndex === 0) {
            remainingRawText = rawText.slice(sentTextNormalized.length).trim();
          }
        }

        // 只对剩余的文本进行标点预测
        console.log(remainingRawText);

        const punctuatedRemainingText = punctuation && remainingRawText.length > 0 ? punctuation.addPunct(remainingRawText) : remainingRawText;

        // 计算剩余部分的 start_time
        const remainingStartTime = remainingTimestamps.length > 0 ? remainingTimestamps[0] + result.start_time : result.start_time;

        // 根据标点符号拆分剩余结果
        const resultWithPunctuation = splitByPunctuation(remainingRawText, punctuatedRemainingText, remainingTokens, remainingTimestamps, remainingStartTime);

        // 检查是否累积了足够多的句子，需要自动发送前面的内容
        // 计算当前有多少个"完整的句子"（有强标点符号的）
        const completedSegments = resultWithPunctuation.filter((seg, idx) => idx < resultWithPunctuation.length - 1 || /[。.！？!?；;…]/.test(seg.punctuation || ''));

        // 如果完整句子数量超过阈值，将前面的句子作为确定内容发送
        if (completedSegments.length >= AUTO_SEND_THRESHOLD) {
          // 计算需要发送多少句（保留最后2句作为可能变化的缓冲区）
          const segmentsToSendCount = completedSegments.length - 2;

          if (segmentsToSendCount > 0) {
            // 有新的句子需要作为确定内容发送
            const newSegmentsToSend = resultWithPunctuation.slice(0, segmentsToSendCount);

            if (newSegmentsToSend.length > 0) {
              // 构建要发送的文本
              const textToSend = newSegmentsToSend.map((seg) => seg.text + (seg.punctuation || '')).join('');

              // 计算这些 segments 的实际开始时间
              // 优先使用第一个 segment 的 start_time（乘以1000转为毫秒）
              const segmentsStartTime =
                newSegmentsToSend[0].start_time !== undefined ? newSegmentsToSend[0].start_time * 1000 : firstReceivedTime !== undefined ? firstReceivedTime : result.start_time * 1000;

              // 计算这些 segments 的结束时间（用于更新下一段的开始时间）
              const lastSentSegment = newSegmentsToSend[newSegmentsToSend.length - 1];
              const lastSentTimestamp = lastSentSegment.timestamps.length > 0 ? lastSentSegment.timestamps[lastSentSegment.timestamps.length - 1] : 0;
              const segmentsEndTime = (lastSentTimestamp + result.start_time) * 1000;

              // 发送这些确定的句子，标记为 isEndpoint: true
              process.send({
                event: 'asr:progress',
                data: {
                  start: segmentsStartTime,
                  end: duration,
                  text: textToSend,
                  isEndpoint: true, // 这些句子已经确定，作为 endpoint 发送
                  isAutoEndpoint: true, // 标记这是自动触发的 endpoint
                  result_with_punctuation: newSegmentsToSend
                }
              });

              // 更新已发送的 token 计数
              const newSentTokensCount = newSegmentsToSend.reduce((acc, seg) => acc + seg.tokens.length, 0);
              sentTokensCount += newSentTokensCount;
              sentText += textToSend;
              sentSegmentsCount += segmentsToSendCount;

              // 更新 firstReceivedTime 为下一段的开始时间
              // 这样后续的 progress 和 endpoint 消息会使用正确的开始时间
              firstReceivedTime = segmentsEndTime;
            }
          }
        }

        // 构建剩余的（未发送的）句子，用于 progress 更新
        // 注意：这里需要跳过刚刚发送的句子
        const remainingAfterSend = resultWithPunctuation.slice(completedSegments.length >= AUTO_SEND_THRESHOLD ? Math.max(0, completedSegments.length - 2) : 0);
        const remainingText = remainingAfterSend.map((seg) => seg.text + (seg.punctuation || '')).join('');

        // 计算剩余部分的开始时间
        // 优先使用第一个剩余 segment 的 start_time
        const remainingProgressStartTime =
          remainingAfterSend.length > 0 && remainingAfterSend[0].start_time !== undefined
            ? remainingAfterSend[0].start_time * 1000
            : firstReceivedTime !== undefined
              ? firstReceivedTime
              : result.start_time * 1000;

        // display.print(segmentIndex, text);
        process.send({
          event: 'asr:progress',
          data: {
            start: remainingProgressStartTime,
            end: duration,
            // timestamp: Math.round((result.timestamps[result.timestamps.length - 1] + result.start_time) * 1000),
            text: remainingText,
            isEndpoint: false,
            result_with_punctuation: remainingAfterSend,
            // 额外信息：告知前端有多少内容已经作为确定内容发送了
            sent_segments_count: sentSegmentsCount,
            sent_text: sentText
          }
        });
      }
    }
  }
}

function stopASR() {
  log('[asr] stopping');
  recognizer.reset(stream);
  recognizer = undefined;
  stream = undefined;
  // display = undefined;
  punctuation = undefined;

  duration = 0;
  lastText = '';

  firstReceivedTime = undefined;

  // 重置累积发送的状态
  sentSegmentsCount = 0;
  sentText = '';
  sentTokensCount = 0;

  log('[asr] stopped');
}

process.on('message', (message) => {
  if (message.event === 'start') {
    log('[asr] start');
    setupASR(message.data);
  } else if (message.event === 'data') {
    sendData(new Float32Array(message.data.samples)); // 16kHz float32 samples
  } else if (message.event === 'stop') {
    log('[asr] stop');
    stopASR();
    process.exit();
  }
});
log('[asr] process initialized');
