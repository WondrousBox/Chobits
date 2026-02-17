/**
 * 字级别时间戳数据（用于卡拉OK式高亮）
 */
export interface WordTimestamp {
  /** 开始时间（秒） */
  st: number;
  /** 结束时间（秒） */
  et: number;
  /** 文字内容 */
  text: string;
}

/**
 * 字幕显示行数据
 */
export interface SubtitleDisplayLine {
  /** 轨道 ID，如 'track-0', 'track-1' */
  trackId: string;
  /** 轨道显示标签，如 '原文', '中文翻译' */
  trackLabel: string;
  /** 当前时间对应的字幕文本 */
  text: string;
  /** 是否为翻译轨道 */
  isTranslation: boolean;
  /** 字级别时间戳（卡拉OK高亮用），仅主轨道且有 segments 数据时存在 */
  words?: WordTimestamp[];
}

/**
 * 自定义事件名称，用于 ResourceSubtitlePlayer 与 SubtitleOverlay 通信
 */
export const SUBTITLE_DISPLAY_EVENT = 'custom:subtitle-display';

/**
 * 事件 detail 类型
 */
export interface SubtitleDisplayEventDetail {
  lines: SubtitleDisplayLine[];
  /** 当前播放时间（秒），用于卡拉OK式字级别高亮 */
  currentTime: number;
}

/**
 * 发送字幕显示行到 SubtitleOverlay
 */
export function dispatchSubtitleDisplay(lines: SubtitleDisplayLine[], currentTime: number): void {
  window.dispatchEvent(
    new CustomEvent(SUBTITLE_DISPLAY_EVENT, {
      detail: { lines, currentTime } satisfies SubtitleDisplayEventDetail
    })
  );
}
