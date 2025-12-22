/**
 * 插件或模型的类别
 */
export type PluginCategory =
  | 'asr' // 自动语音识别 (Automatic Speech Recognition)
  | 'tts' // 文本转语音 (Text-to-Speech)
  | 'stt' // 语音转文本 (Speech-to-Text)
  | 'punctuation' // 标点符号恢复
  | 'translation' // 翻译
  | 'nlp' // 自然语言处理
  | 'vad' // 语音活动检测 (Voice Activity Detection)
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
  archiveType?: 'zip' | 'tar.gz' | 'tar' | 'none';
  category?: PluginCategory;
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
