import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { NodeHandler } from '../types';

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

async function runWhisper(args: string[], ctx: any): Promise<void> {
  // 优先使用资源管理器中的engine，否则回退到PATH中的whisper
  const { pluginResourceManager } = await import('../../plugins/plugin-resource-manager');
  const enginePath = pluginResourceManager.getEnginePath('plugin:whisper', 'whisper');
  const whisperCmd = fs.existsSync(enginePath) ? enginePath : 'whisper';

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
    config: [
      { key: 'model', label: '模型', type: 'string', required: true, default: 'small' },
      { key: 'language', label: '语言', type: 'string', required: false },
      { key: 'task', label: '任务', type: 'string', required: false, default: 'transcribe', description: 'transcribe 或 translate' },
      { key: 'temperature', label: '温度', type: 'number', required: false },
      { key: 'beamSize', label: 'Beam Size', type: 'number', required: false },
      { key: 'bestOf', label: 'Best Of', type: 'number', required: false },
      { key: 'patience', label: '耐心值', type: 'number', required: false },
      { key: 'prompt', label: '提示前缀', type: 'string', required: false },
      { key: 'outputFormats', label: '输出格式', type: 'array', required: false, default: ['txt', 'srt', 'vtt', 'json'] },
      { key: 'translateToEnglish', label: '翻译到英文', type: 'boolean', required: false },
      { key: 'device', label: '设备', type: 'string', required: false },
      { key: 'verbose', label: '详细输出', type: 'boolean', required: false, default: false }
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

    // 参数组装
    const args: string[] = [src, '--output_dir', outDir, '--output_format', 'all'];
    const model = String(config?.model || 'small');
    if (model) args.push('--model', model);
    const language = config?.language ? String(config.language) : '';
    if (language) args.push('--language', language);
    const translate = Boolean(config?.translateToEnglish);
    const task = String(config?.task || (translate ? 'translate' : 'transcribe'));
    if (task) args.push('--task', task);
    if (config?.temperature != null) args.push('--temperature', String(config.temperature));
    if (config?.beamSize != null) args.push('--beam_size', String(config.beamSize));
    if (config?.bestOf != null) args.push('--best_of', String(config.bestOf));
    if (config?.patience != null) args.push('--patience', String(config.patience));
    if (config?.prompt) args.push('--initial_prompt', String(config.prompt));
    if (config?.device) args.push('--device', String(config.device));
    // Whisper 的 --verbose 缺省为 True；这里只在需要时设置为 True，避免额外输出。
    if (config?.verbose) args.push('--verbose', 'True');

    await runWhisper(args, ctx);

    // 收集输出
    const out: Record<string, any> = {};
    const txtPath = path.join(outDir, `${base}.txt`);
    const srtPath = path.join(outDir, `${base}.srt`);
    const vttPath = path.join(outDir, `${base}.vtt`);
    const jsonPath = path.join(outDir, `${base}.json`);

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
