import { NodeConfig, NodeHandler, PortSchema } from '../types';
import { buildWorkflowAiUsageContext, executeWorkflowMusicGenerationRequest, getDynamicModelConfig, getWorkflowProviderPresetId } from './ai-workflow-utils';

async function getDynamicConfig(providerId?: string, providerPresetId?: string): Promise<PortSchema[]> {
  const config = await getDynamicModelConfig({
    defaultProviderId: 'minimax',
    emptyModelDescription: providerId ? `服务商 ${providerId} 暂不支持音乐生成模型` : '请先选择服务商',
    modelDescription: '选择音乐生成模型',
    modelLabel: '模型',
    modelPredicate: (model) => model.type === 'text2music' && Boolean(model.capabilities?.music_generation),
    providerCapability: 'musicGeneration',
    providerId,
    providerPresetId,
    required: true,
    warningScope: 'music-generate'
  });

  config.push(
    {
      key: 'mode',
      label: '生成模式',
      type: 'string',
      required: false,
      default: 'text-to-music',
      description: '选择音乐生成方式',
      inputType: 'select',
      options: [
        { value: 'text-to-music', label: '提示词生成音乐' },
        { value: 'lyrics-to-song', label: '歌词生成歌曲' },
        { value: 'instrumental', label: '纯音乐' },
        { value: 'cover', label: '翻唱 / 参考音频' }
      ]
    },
    {
      key: 'audioFormat',
      label: '音频格式',
      type: 'string',
      required: false,
      default: 'mp3',
      description: '生成音频文件格式',
      inputType: 'select',
      options: [
        { value: 'mp3', label: 'MP3' },
        { value: 'wav', label: 'WAV' },
        { value: 'flac', label: 'FLAC' },
        { value: 'aac', label: 'AAC' }
      ]
    },
    {
      key: 'outputFormat',
      label: '返回形式',
      type: 'string',
      required: false,
      default: 'url',
      description: 'url 会先返回远程音频地址并自动下载到工作流临时目录；hex 会直接返回音频数据',
      inputType: 'select',
      options: [
        { value: 'url', label: 'URL' },
        { value: 'hex', label: 'Hex 音频数据' }
      ]
    },
    {
      key: 'lyricsOptimizer',
      label: '歌词优化',
      type: 'boolean',
      required: false,
      default: false,
      description: '允许 MiniMax 优化输入歌词'
    },
    {
      key: 'isInstrumental',
      label: '纯音乐',
      type: 'boolean',
      required: false,
      default: false,
      description: '忽略歌词并生成纯音乐'
    },
    {
      key: 'referenceAudioUrl',
      label: '参考音频 URL',
      type: 'string',
      required: false,
      default: '',
      description: 'cover 模式可传入参考音频 URL',
      inputType: 'text'
    }
  );

  return config;
}

export const MusicGenerateNode: NodeHandler = {
  spec: {
    id: 'music/music-generate',
    label: '音乐生成',
    category: 'Audio',
    description: '通过提示词、歌词或参考音频生成音乐',
    backgroundColor: '#14b8a6',
    icon: 'TbMusic',
    inputs: [
      { key: 'prompt', label: '提示词', type: 'string', required: true, description: '用于描述曲风、情绪、速度、乐器等音乐方向' },
      { key: 'lyrics', label: '歌词', type: 'string', required: false, description: '可选：用于生成歌曲的人声歌词' }
    ],
    config: [],
    outputs: [
      { key: 'audio', label: '音频', type: ['file', 'string'], description: '优先返回本地音频路径，其次返回远程 URL' },
      { key: 'audioPath', label: '本地音频路径', type: 'string', description: '自动落盘后的本地音频路径' },
      { key: 'audioUrl', label: '远程音频 URL', type: 'string', description: '服务商返回的远程音频 URL' },
      { key: 'artifacts', label: '音频产物', type: 'array', description: '完整音频产物信息' }
    ]
  },
  async getConfig(config?: NodeConfig): Promise<PortSchema[]> {
    const providerId = config?.providerId as string | undefined;
    const providerPresetId = getWorkflowProviderPresetId(config);
    return getDynamicConfig(providerId, providerPresetId);
  },
  async run({ input, config, ctx, emit }) {
    const prompt = String(input.prompt || '').trim();
    if (!prompt) throw new Error('缺少音乐生成提示词');

    const providerId = String(config?.providerId || 'minimax');
    const providerPresetId = getWorkflowProviderPresetId(config);
    const model = String(config?.model || 'music-2.6');
    const mode = String(config?.mode || (input.lyrics ? 'lyrics-to-song' : 'text-to-music')) as any;
    const lyrics = String(input.lyrics || '').trim() || undefined;
    const outputFormat = String(config?.outputFormat || 'url');
    const audioFormat = String(config?.audioFormat || 'mp3');
    const referenceAudioUrl = String(config?.referenceAudioUrl || '').trim() || undefined;
    const lyricsOptimizer = config?.lyricsOptimizer === true;
    const isInstrumental = config?.isInstrumental === true || mode === 'instrumental';

    emit('node:progress', { progress: 10, message: '准备调用音乐生成服务...' });
    emit('node:progress', { progress: 30, message: '调用 MiniMax 音乐生成...' });

    const response = await executeWorkflowMusicGenerationRequest({
      audioSetting: {
        format: audioFormat
      },
      extras: {
        minimax: {
          ...(referenceAudioUrl ? { audio_url: referenceAudioUrl } : {}),
          is_instrumental: isInstrumental,
          lyrics_optimizer: lyricsOptimizer
        },
        outputDir: ctx.tmpDir
      },
      lyrics,
      mode,
      model,
      outputFormat,
      prompt,
      providerId,
      providerPresetId,
      workflowAiUsage: buildWorkflowAiUsageContext(ctx, {
        nodeLabel: '音乐生成',
        nodeType: 'music/music-generate',
        operationKey: 'generate_music',
        usageStage: 'generate'
      })
    });

    emit('node:progress', { progress: 75, message: '整理音乐生成结果...' });

    const artifact = response.artifacts[0];
    const audioPath = artifact?.filePath || response.filePath || '';
    const audioUrl = artifact?.audioUrl || response.audioUrl || '';
    const audioBase64 = artifact?.audioBase64 || response.audioBase64 || '';
    const audio = audioPath || audioUrl || (audioBase64 ? `data:${artifact?.mimeType || 'audio/mpeg'};base64,${audioBase64}` : '');

    if (!audio) {
      throw new Error('音乐生成完成但没有可用音频产物');
    }

    emit('node:progress', { progress: 100, message: '音乐生成完成' });

    return {
      artifacts: response.artifacts,
      audio,
      audioPath,
      audioUrl,
      durationMs: artifact?.durationMs,
      mimeType: artifact?.mimeType,
      model: response.model,
      providerId: response.providerId
    };
  }
};
