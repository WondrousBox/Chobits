/**
 * 插件或模型的类别
 */
export type PluginCategory =
  // 核心基础
  | 'core' // 核心引擎（必要的基础组件，如 FFmpeg）
  // 语音相关
  | 'asr' // 自动语音识别 (Automatic Speech Recognition)
  | 'tts' // 文本转语音 (Text-to-Speech)
  | 'stt' // 语音转文本 (Speech-to-Text)
  | 'vad' // 语音活动检测 (Voice Activity Detection)
  | 'voice-clone' // 声音克隆
  // 文本/语言相关
  | 'llm' // 大语言模型 (Large Language Model)
  | 'nlp' // 自然语言处理
  | 'translation' // 翻译
  | 'punctuation' // 标点符号恢复
  | 'embedding' // 文本嵌入/向量化
  // 音频相关
  | 'audio-process' // 音频处理
  // 图像相关
  | 'image-gen' // 图像生成 (Text-to-Image)
  | 'image-edit' // 图像编辑
  | 'ocr' // 光学字符识别
  | 'image-recognition' // 图像识别/分类
  | 'face' // 人脸检测/识别
  | 'image-super-res' // 图像超分辨率
  // 视频相关
  | 'video-gen' // 视频生成
  | 'video-edit' // 视频编辑
  | 'video-analysis' // 视频分析
  // 多模态
  | 'multimodal' // 多模态模型
  // 其他
  | 'agent' // AI 代理
  | 'code' // 代码生成/补全
  | 'music' // 音乐生成
  | 'three-d' // 3D 模型生成
  | 'other'; // 其他类别

export type PluginDefinition = {
  id: string;
  pluginId: string;
  type: 'engine' | 'model';
  name: string;
  displayName: string;
  description?: string;
  version: string;
  binaryName?: string;
  archiveType?: 'zip' | 'tar.gz' | 'tar.bz2' | 'tar' | 'none';
  /**
   * 插件分类，支持单个分类或多个分类（表示插件具有多种能力）
   */
  category?: PluginCategory | PluginCategory[];
  /**
   * 支持的语言列表
   * 使用 ISO 639-1 语言代码（如 'zh', 'en', 'ja' 等）
   * 如果为空数组或未指定，表示支持所有语言或语言无关
   */
  languages?: string[];
  platforms: {
    platform: string;
    arch: string;
    sourceUrl: string;
    sizeBytes?: number;
    sha256?: string; // SHA256校验和
  }[];
  // 模型作为引擎的子资源（仅当 type === 'engine' 时存在）
  models?: PluginDefinition[];
};

/**
 * 判断插件是否是系统预设的（已内置安装）
 * 条件：archiveType 为 'none' 且 platforms 数组为空
 */
export function isSystemPresetPlugin(plugin: PluginDefinition): boolean {
  return plugin.archiveType === 'none' && (!plugin.platforms || plugin.platforms.length === 0);
}

/**
 * 判断插件是否兼容当前平台
 * @param plugin 插件定义
 * @param platform 当前平台 ('win32' | 'darwin' | 'linux')
 * @param arch 当前架构 ('arm64' | 'x64')
 */
export function isPluginCompatibleWithPlatform(plugin: PluginDefinition, platform: 'win32' | 'darwin' | 'linux', arch: 'arm64' | 'x64'): boolean {
  // 如果没有 platforms 数组或为空，检查是否是系统预设插件
  if (!plugin.platforms || plugin.platforms.length === 0) {
    return isSystemPresetPlugin(plugin);
  }

  // 检查是否有匹配当前平台的配置
  return plugin.platforms.some((p) => {
    // platform 和 arch 都需要匹配，或者是 'all'
    const platformMatch = p.platform === platform || p.platform === 'all';
    const archMatch = p.arch === arch || p.arch === 'all';
    return platformMatch && archMatch;
  });
}
