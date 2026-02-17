/**
 * 导出对话框类型定义
 */

/** 可导出的轨道类型 */
export type ExportTrackType = 'video' | 'audio' | 'subtitle' | 'tts-audio';

/** 可导出轨道信息 */
export interface ExportTrack {
  /** 轨道唯一ID */
  id: string;
  /** 轨道显示名称 */
  label: string;
  /** 轨道类型 */
  type: ExportTrackType;
  /** 是否默认选中 */
  defaultChecked: boolean;
  /** 轨道描述 */
  description?: string;
  /** 语言代码（字幕/TTS用） */
  languageCode?: string;
}

/** 字幕嵌入模式 */
export type SubtitleEmbedMode = 'hardcode' | 'softcode' | 'external';

/** 字幕字体名称 */
export type SubtitleFontName = 'Arial' | 'Microsoft YaHei' | 'SimHei' | 'SimSun' | 'KaiTi' | 'FangSong' | 'NSimSun' | 'Impact';

/** 字幕对齐方式 (ASS Alignment, numpad 底行: 1=左, 2=中, 3=右) */
export type SubtitleAlign = '1' | '2' | '3';

/** 字幕描边样式 (ASS BorderStyle: 1=Outline+Shadow, 3=Opaque box) */
export type SubtitleBorderStyle = '1' | '3';

/**
 * 字幕样式配置
 * 字段对应 ASS Style 行:
 * Style: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour,
 *        BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing,
 *        Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
 */
export interface SubtitleStyleConfig {
  /** Fontname */
  fontName: SubtitleFontName;
  /** Fontsize (px) */
  fontSize: number;
  /** PrimaryColour — 文字填充色 (ASS: &HBBGGRR) */
  primaryColor: string;
  /** OutlineColour — 描边颜色 (ASS: &HBBGGRR) */
  outlineColor: string;
  /** BorderStyle (1=Outline+Shadow, 3=Opaque box) */
  borderStyle: SubtitleBorderStyle;
  /** Outline — 描边宽度 (px) */
  outlineWidth: number;
  /** Shadow — 阴影深度 (px) */
  shadowDepth: number;
  /** MarginV — 垂直边距 (px) */
  marginV: number;
  /** Alignment (ASS numpad: 1=左下, 2=中下, 3=右下) */
  alignment: SubtitleAlign;
  /** Bold (-1=true, 0=false) */
  bold: boolean;
  /** Italic (-1=true, 0=false) */
  italic: boolean;
  /** BackColour — 背景/阴影颜色 (ASS: &HAABBGGRR, AA: 00=不透明, FF=透明) */
  backColor: string;
}

/** 视频编码格式 */
export type VideoCodec = 'h264' | 'h265' | 'vp9';

/** 视频容器格式 */
export type VideoContainer = 'mp4' | 'mkv' | 'webm';

/** 视频清晰度预设 */
export type VideoQualityPreset = 'original' | '4k' | '1080p' | '720p' | '480p';

/** 视频清晰度预设详情 */
export interface QualityPresetInfo {
  label: string;
  width?: number;
  height?: number;
  bitrate?: string;
  description: string;
}

/** 导出配置 */
export interface ExportConfig {
  /** 选中的轨道ID列表 */
  selectedTrackIds: string[];
  /** 字幕嵌入模式 */
  subtitleEmbedMode: SubtitleEmbedMode;
  /** 视频编码 */
  videoCodec: VideoCodec;
  /** 容器格式 */
  container: VideoContainer;
  /** 清晰度预设 */
  qualityPreset: VideoQualityPreset;
  /** CRF 值（越小质量越高，0-51） */
  crf: number;
  /** 音频码率（kbps） */
  audioBitrate: number;
  /** 字幕样式配置（仅硬字幕时生效） */
  subtitleStyle?: SubtitleStyleConfig;
  /** 是否启用卡拉OK式字级别高亮（需要 segments 数据） */
  enableKaraoke?: boolean;
}

/** 已导出的文件信息 */
export interface ExportedFileInfo {
  /** 显示名称 */
  label: string;
  /** 文件名 */
  fileName: string;
  /** 完整路径 */
  filePath: string;
  /** 文件类型 */
  type: 'subtitle' | 'tts-audio' | 'video';
}

/** 导出进度信息 */
export interface ExportProgress {
  /** 当前阶段 */
  stage: 'preparing' | 'exporting-tracks' | 'encoding' | 'done' | 'error';
  /** 阶段描述 */
  stageLabel: string;
  /** 当前阶段进度 0-100 */
  progress: number;
  /** 总进度 0-100 */
  totalProgress: number;
  /** 错误信息 */
  error?: string;
  /** 已导出的文件列表（逐步更新） */
  exportedFiles?: ExportedFileInfo[];
  /** 导出目录 */
  exportDir?: string;
}

/** 导出请求参数（发送给主进程） */
export interface ExportRequest {
  /** 资源ID（handler 端通过此 ID 查询数据库获取视频路径） */
  resourceId: string;
  /** 总时长（秒） */
  duration: number;
  /** 导出配置 */
  config: ExportConfig;
  /** 字幕轨道数据 */
  subtitleTracks: ExportSubtitleTrack[];
  /** TTS音频轨道数据 */
  ttsAudioTracks: ExportTTSAudioTrack[];
  /** 工作区ID */
  workspaceId?: string;
  /** 文件夹ID */
  folderId?: string;
}

/** 导出用字幕轨道 */
export interface ExportSubtitleTrack {
  /** 轨道ID */
  trackId: string;
  /** 轨道标签 */
  label: string;
  /** 语言代码 */
  languageCode?: string;
  /** 字幕内容（SRT格式） */
  srtContent: string;
  /** 字幕内容（ASS格式，用于硬字幕） */
  assContent?: string;
}

/** 导出用TTS音频轨道 */
export interface ExportTTSAudioTrack {
  /** TTS轨道ID（如 main, zh-CN） */
  trackId: string;
  /** 轨道标签 */
  label: string;
  /** 音频片段列表 */
  segments: ExportTTSSegment[];
}

/** 导出用TTS音频片段 */
export interface ExportTTSSegment {
  /** 片段索引 */
  index: number;
  /** 音频文件路径 */
  audioPath: string;
  /** 在时间轴上的开始时间（秒） */
  startTime: number;
  /** 在时间轴上的结束时间（秒） */
  endTime: number;
  /** TTS原始音频时长（秒） */
  originalDuration: number;
  /** 去静音后的音频时长（秒） */
  trimmedDuration?: number;
  /** 播放速率：块时长 / 音频时长。>1 需减速，<1需加速 */
  playbackRate?: number;
}

/** 清晰度预设映射 */
export const QUALITY_PRESETS: Record<VideoQualityPreset, QualityPresetInfo> = {
  original: {
    label: '原始画质',
    description: '保持原视频分辨率和码率'
  },
  '4k': {
    label: '4K (2160p)',
    width: 3840,
    height: 2160,
    bitrate: '20M',
    description: '3840×2160，超高清'
  },
  '1080p': {
    label: '1080p',
    width: 1920,
    height: 1080,
    bitrate: '8M',
    description: '1920×1080，全高清'
  },
  '720p': {
    label: '720p',
    width: 1280,
    height: 720,
    bitrate: '5M',
    description: '1280×720，高清'
  },
  '480p': {
    label: '480p',
    width: 854,
    height: 480,
    bitrate: '2.5M',
    description: '854×480，标清'
  }
};

/** 默认字幕样式配置 */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyleConfig = {
  fontName: 'Microsoft YaHei',
  fontSize: 48,
  primaryColor: '&HFFFFFF',
  outlineColor: '&H000000',
  borderStyle: '1',
  outlineWidth: 2,
  shadowDepth: 1,
  marginV: 30,
  alignment: '2',
  bold: true,
  italic: false,
  backColor: '&H80000000'
};

/** 默认导出配置 */
export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  selectedTrackIds: [],
  subtitleEmbedMode: 'hardcode',
  videoCodec: 'h264',
  container: 'mp4',
  qualityPreset: '1080p',
  crf: 23,
  audioBitrate: 192,
  subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
  enableKaraoke: false
};
