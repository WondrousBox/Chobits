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
}

/**
 * 自定义事件名称，用于 ResourceSubtitlePlayer 与 SubtitleOverlay 通信
 */
export const SUBTITLE_DISPLAY_EVENT = 'custom:subtitle-display';

/**
 * 发送字幕显示行到 SubtitleOverlay
 */
export function dispatchSubtitleDisplay(lines: SubtitleDisplayLine[]): void {
    window.dispatchEvent(
        new CustomEvent(SUBTITLE_DISPLAY_EVENT, {
            detail: { lines }
        })
    );
}
