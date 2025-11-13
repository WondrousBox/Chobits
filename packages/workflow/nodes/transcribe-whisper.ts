import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { NodeHandler } from '../types';

// 模型名称映射：文件名 -> 简化名称（用于 dtw 参数）
const dtwMap: Record<string, string> = {
  'ggml-tiny.bin': 'tiny',
  'ggml-tiny.en.bin': 'tiny.en',
  'ggml-base.bin': 'base',
  'ggml-base.en.bin': 'base.en',
  'ggml-small.bin': 'small',
  'ggml-small.en.bin': 'small.en',
  'ggml-medium.bin': 'medium',
  'ggml-medium.en.bin': 'medium.en',
  'ggml-large-v1.bin': 'large.v1',
  'ggml-large-v2.bin': 'large.v2',
  'ggml-large-v3.bin': 'large.v3'
};

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function runWhisper(args: string[], ctx: any): Promise<void> {
  // 优先使用资源管理器中的engine，否则回退到PATH中的whisper-cli
  const { pluginResourceManager } = await import('../../plugins/plugin-resource-manager');
  const { platform } = await import('node:os');
  const binaryName = platform() === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  const enginePath = pluginResourceManager.getEnginePath('plugin:whisper', binaryName);
  const whisperCmd = fs.existsSync(enginePath) ? enginePath : 'whisper-cli';

  await new Promise<void>((resolve, reject) => {
    const child = spawn(whisperCmd, args, { stdio: 'ignore' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`whisper failed: ${code}`))));
    child.on('error', (e) => reject(e));
  });
}

export const TranscribeWhisperNode: NodeHandler = {
  spec: {
    id: 'media/transcribe-whisper',
    label: '音视频转录 (Whisper)',
    category: 'Media',
    description: '使用 Whisper CLI 对音频或视频进行离线转录',
    requires: ['plugin:whisper', 'plugin:ffmpeg'],
    inputs: [{ key: 'media', label: '媒体文件', type: ['file', 'string'], required: true }],
    configGroups: {
      basic: { label: '基础属性', defaultExpanded: true },
      advanced: { label: '高级设置', defaultExpanded: false },
      more: { label: '更多配置', defaultExpanded: false }
    },
    config: [
      {
        key: 'model',
        label: '模型',
        type: 'string',
        required: true,
        default: 'ggml-base.bin',
        description: '选择 Whisper 模型，更大的模型通常更准确但速度更慢',
        inputType: 'select',
        options: [
          { value: 'ggml-tiny.bin', label: 'Tiny (最快，精度较低)' },
          { value: 'ggml-tiny.en.bin', label: 'Tiny English (仅英语)' },
          { value: 'ggml-base.bin', label: 'Base (平衡)' },
          { value: 'ggml-base.en.bin', label: 'Base English (仅英语)' },
          { value: 'ggml-small.bin', label: 'Small (较好精度)' },
          { value: 'ggml-small.en.bin', label: 'Small English (仅英语)' },
          { value: 'ggml-medium.bin', label: 'Medium (高精度)' },
          { value: 'ggml-medium.en.bin', label: 'Medium English (仅英语)' },
          { value: 'ggml-large-v1.bin', label: 'Large v1 (最高精度)' },
          { value: 'ggml-large-v2.bin', label: 'Large v2 (最高精度)' },
          { value: 'ggml-large-v3.bin', label: 'Large v3 (最高精度)' }
        ]
      },
      {
        key: 'language',
        label: '语言',
        type: 'string',
        required: false,
        description: '选择转录语言，留空或选择"自动"将自动检测',
        default: 'auto',
        inputType: 'select',
        options: [
          { value: 'auto', label: '自动' },
          { value: 'en', label: '英语' },
          { value: 'zh', label: '中文' },
          { value: 'zh_s', label: '简体中文' },
          { value: 'zh_t', label: '繁体中文' },
          { value: 'de', label: '德语' },
          { value: 'es', label: '西班牙语' },
          { value: 'ru', label: '俄语' },
          { value: 'ko', label: '韩语' },
          { value: 'fr', label: '法语' },
          { value: 'ja', label: '日语' },
          { value: 'pt', label: '葡萄牙语' },
          { value: 'tr', label: '土耳其语' },
          { value: 'pl', label: '波兰语' },
          { value: 'ca', label: '加泰罗尼亚语' },
          { value: 'nl', label: '荷兰语' },
          { value: 'ar', label: '阿拉伯语' },
          { value: 'sv', label: '瑞典语' },
          { value: 'it', label: '意大利语' },
          { value: 'id', label: '印尼语' },
          { value: 'hi', label: '印地语' },
          { value: 'fi', label: '芬兰语' },
          { value: 'vi', label: '越南语' },
          { value: 'he', label: '希伯来语' },
          { value: 'uk', label: '乌克兰语' },
          { value: 'el', label: '希腊语' },
          { value: 'ms', label: '马来语' },
          { value: 'cs', label: '捷克语' },
          { value: 'ro', label: '罗马尼亚语' },
          { value: 'da', label: '丹麦语' },
          { value: 'hu', label: '匈牙利语' },
          { value: 'ta', label: '泰米尔语' },
          { value: 'no', label: '挪威语' },
          { value: 'th', label: '泰语' },
          { value: 'ur', label: '乌尔都语' },
          { value: 'hr', label: '克罗地亚语' },
          { value: 'bg', label: '保加利亚语' },
          { value: 'lt', label: '立陶宛语' },
          { value: 'la', label: '拉丁语' },
          { value: 'mi', label: '毛利语' },
          { value: 'ml', label: '马拉雅拉姆语' },
          { value: 'cy', label: '威尔士语' },
          { value: 'sk', label: '斯洛伐克语' },
          { value: 'te', label: '泰卢固语' },
          { value: 'fa', label: '波斯语' },
          { value: 'lv', label: '拉脱维亚语' },
          { value: 'bn', label: '孟加拉语' },
          { value: 'sr', label: '塞尔维亚语' },
          { value: 'az', label: '阿塞拜疆语' },
          { value: 'sl', label: '斯洛文尼亚语' },
          { value: 'kn', label: '卡纳达语' },
          { value: 'et', label: '爱沙尼亚语' },
          { value: 'mk', label: '马其顿语' },
          { value: 'br', label: '布列塔尼语' },
          { value: 'eu', label: '巴斯克语' },
          { value: 'is', label: '冰岛语' },
          { value: 'hy', label: '亚美尼亚语' },
          { value: 'ne', label: '尼泊尔语' },
          { value: 'mn', label: '蒙古语' },
          { value: 'bs', label: '波斯尼亚语' },
          { value: 'kk', label: '哈萨克语' },
          { value: 'sq', label: '阿尔巴尼亚语' },
          { value: 'sw', label: '斯瓦希里语' },
          { value: 'gl', label: '加利西亚语' },
          { value: 'mr', label: '马拉地语' },
          { value: 'pa', label: '旁遮普语' },
          { value: 'si', label: '僧伽罗语' },
          { value: 'km', label: '高棉语' },
          { value: 'sn', label: '绍纳语' },
          { value: 'yo', label: '约鲁巴语' },
          { value: 'so', label: '索马里语' },
          { value: 'af', label: '南非荷兰语' },
          { value: 'oc', label: '奥克西唐语' },
          { value: 'ka', label: '格鲁吉亚语' },
          { value: 'be', label: '白俄罗斯语' },
          { value: 'tg', label: '塔吉克语' },
          { value: 'sd', label: '信德语' },
          { value: 'gu', label: '古吉拉特语' },
          { value: 'am', label: '阿姆哈拉语' },
          { value: 'yi', label: '意第绪语' },
          { value: 'lo', label: '老挝语' },
          { value: 'uz', label: '乌兹别克语' },
          { value: 'fo', label: '法罗语' },
          { value: 'ht', label: '海地克里奥尔语' },
          { value: 'ps', label: '普什图语' },
          { value: 'tk', label: '土库曼语' },
          { value: 'nn', label: '挪威尼诺斯克语' },
          { value: 'mt', label: '马耳他语' },
          { value: 'sa', label: '梵语' },
          { value: 'lb', label: '卢森堡语' },
          { value: 'my', label: '缅甸语' },
          { value: 'bo', label: '藏语' },
          { value: 'tl', label: '他加禄语' },
          { value: 'mg', label: '马达加斯加语' },
          { value: 'as', label: '阿萨姆语' },
          { value: 'tt', label: '塔塔尔语' },
          { value: 'haw', label: '夏威夷语' },
          { value: 'ln', label: '林加拉语' },
          { value: 'ha', label: '豪萨语' },
          { value: 'ba', label: '巴什基尔语' },
          { value: 'jw', label: '爪哇语' },
          { value: 'su', label: '巽他语' },
          { value: 'yue', label: '粤语' }
        ]
      },
      { key: 'threads', label: '线程数', type: 'number', required: false, description: '使用的线程数', group: 'more' },
      { key: 'translate', label: '翻译模式', type: 'boolean', required: false, default: false, description: '是否翻译到英文', group: 'more' },
      { key: 'outputFormats', label: '输出格式', type: 'array', required: false, default: ['txt', 'srt', 'vtt', 'json'], description: '输出格式列表', group: 'more' },
      { key: 'printProgress', label: '打印进度', type: 'boolean', required: false, default: false, group: 'more' },
      { key: 'printColors', label: '打印颜色', type: 'boolean', required: false, default: false, group: 'more' },
      { key: 'speedUp', label: '加速模式', type: 'boolean', required: false, default: false, description: '使用加速模式（可能降低质量）', group: 'more' },
      { key: 'vad', label: '语音活动检测', type: 'boolean', required: false, default: false, description: '通过VAD识别人说话部分' },
      { key: 'noTimestamps', label: '无时间戳', type: 'boolean', required: false, default: false, group: 'more' },
      { key: 'singleSegment', label: '单段模式', type: 'boolean', required: false, default: false, description: '输出为单个段落', group: 'more' },
      { key: 'wordTimestamps', label: '单词时间戳', type: 'boolean', required: false, default: false, group: 'more' },
      { key: 'maxLen', label: '最大长度', type: 'number', required: false, default: 0, description: '最大段落长度', group: 'advanced' },
      { key: 'dtw', label: '启用 DTW', type: 'boolean', required: false, default: false, description: '启用动态时间规整（DTW）优化', group: 'more' },
      { key: 'prompt', label: '上下文提示', type: 'string', required: false, default: '', description: '提供上下文提示以改善转录质量', group: 'advanced' },
      { key: 'maxContent', label: '最大文本上下文', type: 'number', required: false, default: -1, description: '最大文本上下文token数（-1表示无限制）', group: 'advanced' },
      { key: 'splitOnWord', label: '单词边界分割', type: 'boolean', required: false, default: false, description: '在单词边界分割', group: 'advanced' },
      { key: 'entropyThold', label: '熵阈值', type: 'number', required: false, default: 2.4, description: '解码器失败的熵阈值', group: 'advanced' },
      { key: 'logprobThold', label: '对数概率阈值', type: 'number', required: false, default: -1.0, description: '解码器失败的对数概率阈值', group: 'advanced' },
      { key: 'noSpeechThold', label: '无语音阈值', type: 'number', required: false, default: 0.6, description: '无语音阈值', group: 'advanced' },
      { key: 'temperature', label: '采样温度', type: 'number', required: false, default: 0.0, description: '采样温度', group: 'advanced' },
      { key: 'temperatureInc', label: '温度增量', type: 'number', required: false, default: 0.2, description: '温度增量', group: 'advanced' },
      { key: 'useGpu', label: '使用GPU', type: 'boolean', required: false, default: true, description: '启用GPU加速' },
      { key: 'flashAttn', label: 'Flash Attention', type: 'boolean', required: false, default: false, description: '启用Flash Attention', group: 'advanced' },
      { key: 'sns', label: 'SNS', type: 'boolean', required: false, default: false, description: '启用SNS', group: 'advanced' }
    ],
    outputs: [
      { key: 'text', label: '全文文本', type: 'string' },
      { key: 'segments', label: '分段 JSON', type: 'object' },
      { key: 'srt', label: 'SRT 文件', type: 'file' },
      { key: 'vtt', label: 'VTT 文件', type: 'file' },
      { key: 'json', label: 'JSON 文件', type: 'file' },
      { key: 'txt', label: 'TXT 文件', type: 'file' }
    ]
  },
  async run({ input, config, ctx }) {
    const src = String(input.media || '');
    if (!src) throw new Error('缺少媒体文件路径');
    if (!fs.existsSync(src)) throw new Error(`媒体文件不存在: ${src}`);

    const base = path.parse(src).name;
    const outDir = path.join(ctx.tmpDir, 'whisper', `${base}-${randomUUID()}`);
    fs.mkdirSync(outDir, { recursive: true });

    // whisper.cpp 参数组装
    const args: string[] = ['-f', src];

    // 模型参数 (-m)
    const modelKey = String(config?.model || 'ggml-base.bin');
    if (modelKey) args.push('-m', modelKey);

    // 语言参数 (-l)
    // 如果语言为 'auto' 或空，则不传递 -l 参数，让 whisper.cpp 自动检测
    const language = config?.language ? String(config.language) : '';
    if (language && language !== 'auto') {
      args.push('-l', language);
    }

    // 线程数 (-t)
    if (config?.threads != null) args.push('-t', String(config.threads));

    // 翻译模式 (--translate)
    if (config?.translate) args.push('--translate');

    // 输出格式 (-otxt, -osrt, -ovtt, -ojson)
    const outputFormats = Array.isArray(config?.outputFormats) ? config.outputFormats : ['txt', 'srt', 'vtt', 'json'];
    if (outputFormats.includes('txt')) args.push('-otxt');
    if (outputFormats.includes('srt')) args.push('-osrt');
    if (outputFormats.includes('vtt')) args.push('-ovtt');
    if (outputFormats.includes('json')) args.push('-ojson');

    // 输出目录（whisper.cpp 会在输入文件同目录生成输出，需要指定输出目录时需要特殊处理）
    // 注意：whisper.cpp 默认在输入文件同目录输出，我们需要在运行后移动文件
    // 这里先不设置输出目录，运行后再移动文件到指定目录

    // 其他选项
    if (config?.printProgress) args.push('--print-progress');
    if (config?.printColors) args.push('--print-colors');
    if (config?.speedUp) args.push('--speed-up');
    if (config?.vad) args.push('--vad');
    if (config?.noTimestamps) args.push('--no-timestamps');
    if (config?.singleSegment) args.push('--single-segment');
    if (config?.wordTimestamps) args.push('--word-timestamps');
    if (config?.maxLen != null && config.maxLen !== 0) args.push('--max-len', String(config.maxLen));

    // 上下文提示 (--prompt)
    if (config?.prompt && String(config.prompt).trim()) {
      args.push('--prompt', String(config.prompt));
    }

    // 最大文本上下文 (--max-context)
    if (config?.maxContent != null && config.maxContent !== -1) {
      args.push('--max-context', String(config.maxContent));
    }

    // 单词边界分割 (--split-on-word)
    if (config?.splitOnWord) args.push('--split-on-word');

    // 熵阈值 (--entropy-thold)
    if (config?.entropyThold != null && config.entropyThold !== 2.4) {
      args.push('--entropy-thold', String(config.entropyThold));
    }

    // 对数概率阈值 (--logprob-thold)
    if (config?.logprobThold != null && config.logprobThold !== -1.0) {
      args.push('--logprob-thold', String(config.logprobThold));
    }

    // 无语音阈值 (--no-speech-thold)
    if (config?.noSpeechThold != null && config.noSpeechThold !== 0.6) {
      args.push('--no-speech-thold', String(config.noSpeechThold));
    }

    // 采样温度 (--temperature)
    if (config?.temperature != null && config.temperature !== 0.0) {
      args.push('--temperature', String(config.temperature));
    }

    // 温度增量 (--temperature-inc)
    if (config?.temperatureInc != null && config.temperatureInc !== 0.2) {
      args.push('--temperature-inc', String(config.temperatureInc));
    }

    // GPU 使用 (--use-gpu)
    // 默认启用 GPU，只有在明确设置为 false 时才禁用
    if (config?.useGpu === false) {
      args.push('--no-gpu');
    } else {
      // 默认值或明确设置为 true 时启用 GPU
      args.push('--use-gpu');
    }

    // Flash Attention (--flash-attn)
    if (config?.flashAttn) args.push('--flash-attn');

    // SNS (--sns)
    if (config?.sns) args.push('--sns');

    // DTW 参数 (--dtw)
    // 如果启用 dtw，使用映射后的文件名作为 dtw 参数值
    if (config?.dtw) {
      const modelFileName = dtwMap[modelKey];
      if (modelFileName) {
        args.push('--dtw', modelFileName);
      }
    }

    await runWhisper(args, ctx);

    // whisper.cpp 默认在输入文件同目录生成输出文件
    // 需要将输出文件移动到指定目录
    const srcDir = path.dirname(src);
    const srcBase = path.parse(src).name;
    const srcTxtPath = path.join(srcDir, `${srcBase}.txt`);
    const srcSrtPath = path.join(srcDir, `${srcBase}.srt`);
    const srcVttPath = path.join(srcDir, `${srcBase}.vtt`);
    const srcJsonPath = path.join(srcDir, `${srcBase}.json`);

    // 移动文件到输出目录
    const txtPath = path.join(outDir, `${base}.txt`);
    const srtPath = path.join(outDir, `${base}.srt`);
    const vttPath = path.join(outDir, `${base}.vtt`);
    const jsonPath = path.join(outDir, `${base}.json`);

    if (fileExists(srcTxtPath)) {
      fs.copyFileSync(srcTxtPath, txtPath);
      fs.unlinkSync(srcTxtPath);
    }
    if (fileExists(srcSrtPath)) {
      fs.copyFileSync(srcSrtPath, srtPath);
      fs.unlinkSync(srcSrtPath);
    }
    if (fileExists(srcVttPath)) {
      fs.copyFileSync(srcVttPath, vttPath);
      fs.unlinkSync(srcVttPath);
    }
    if (fileExists(srcJsonPath)) {
      fs.copyFileSync(srcJsonPath, jsonPath);
      fs.unlinkSync(srcJsonPath);
    }

    // 收集输出
    const out: Record<string, any> = {};

    if (fileExists(txtPath)) {
      try {
        out.txt = txtPath;
        out.text = fs.readFileSync(txtPath, 'utf8');
      } catch {
        // ignore read error, keep going
      }
    }
    if (fileExists(srtPath)) out.srt = srtPath;
    if (fileExists(vttPath)) out.vtt = vttPath;
    if (fileExists(jsonPath)) {
      out.json = jsonPath;
      try {
        const obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (obj && typeof obj === 'object' && Array.isArray(obj.segments)) out.segments = obj.segments;
      } catch {
        // ignore parse error
      }
    }

    // 根据用户期望的输出格式过滤（如果设置了）
    const expected: string[] = Array.isArray(config?.outputFormats) ? config!.outputFormats : [];
    if (expected.length) {
      // 仅保留用户请求的文件路径字段；text/segments 不过滤（便于链路使用）
      const keepFiles = new Set(expected.map(String));
      if (!keepFiles.has('txt')) delete out.txt;
      if (!keepFiles.has('srt')) delete out.srt;
      if (!keepFiles.has('vtt')) delete out.vtt;
      if (!keepFiles.has('json')) delete out.json;
    }

    return out;
  }
};
