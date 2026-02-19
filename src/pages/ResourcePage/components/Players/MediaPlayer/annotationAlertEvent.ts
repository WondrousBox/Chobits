import type { AnnotationItem } from '../SubtitlePlayer/useAnnotations';

/**
 * 标注 Alert 显示事件
 * 当视频播放到标注时间范围时，广播此事件以在视频右上角显示alert卡片
 */

export const ANNOTATION_ALERT_EVENT = 'custom:annotation-alert';

export interface AnnotationAlertData {
  /** 当前活跃的标注列表（可能同时有多个标注在当前时间范围内） */
  annotations: AnnotationItem[];
  /** 当前播放时间 */
  currentTime: number;
}

export interface AnnotationAlertEventDetail {
  annotations: AnnotationItem[];
  currentTime: number;
}

/**
 * 广播标注alert事件
 */
export function dispatchAnnotationAlert(annotations: AnnotationItem[], currentTime: number): void {
  const event = new CustomEvent<AnnotationAlertEventDetail>(ANNOTATION_ALERT_EVENT, {
    detail: { annotations, currentTime }
  });
  window.dispatchEvent(event);
}

/**
 * 清除标注alert（当没有标注需要显示时）
 */
export function dispatchAnnotationAlertClear(): void {
  const event = new CustomEvent<AnnotationAlertEventDetail>(ANNOTATION_ALERT_EVENT, {
    detail: { annotations: [], currentTime: 0 }
  });
  window.dispatchEvent(event);
}
