/**
 * 标注标记事件系统
 *
 * 用于 ResourceSubtitlePlayer（标注数据持有者）与 ProgressSlider（进度条 UI）之间的通信。
 * ResourceSubtitlePlayer 广播标注时间位置，ProgressSlider 在进度条上绘制对应标记。
 */

/** 单个标注标记 */
export interface AnnotationMarker {
  /** 标注 ID */
  id: string;
  /** 起始时间（秒） */
  startTime: number;
  /** 结束时间（秒） */
  endTime: number;
  /** 标注类型 */
  type: string;
  /** 被标注的原文 */
  text?: string;
  /** 标注标题 */
  title?: string;
  /** 标注描述 */
  description?: string;
  /** 标注颜色 */
  color?: string;
}

export const ANNOTATION_MARKERS_UPDATE_EVENT = 'custom:annotation-markers-update';

/** 广播标注标记列表（由 ResourceSubtitlePlayer 调用） */
export function dispatchAnnotationMarkers(markers: AnnotationMarker[]): void {
  window.dispatchEvent(
    new CustomEvent<AnnotationMarker[]>(ANNOTATION_MARKERS_UPDATE_EVENT, {
      detail: markers
    })
  );
}
