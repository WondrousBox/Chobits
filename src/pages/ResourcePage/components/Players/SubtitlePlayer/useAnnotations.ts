import { debounce } from 'lodash-es';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import type { AnnotationItem, AnnotationType } from '../../../../../../electron/main/handlers/annotation/ipc-main';

export type { AnnotationItem, AnnotationType };

// ========== 标注颜色预设 ==========

const ANNOTATION_COLORS: Record<AnnotationType, string> = {
  highlight: 'hsl(48, 95%, 55%)',   // 黄色高亮
  note: 'hsl(210, 80%, 60%)',       // 蓝色笔记
  vocabulary: 'hsl(150, 70%, 50%)', // 绿色词汇
  comment: 'hsl(280, 70%, 60%)',    // 紫色评论
  custom: 'hsl(30, 80%, 55%)'      // 橙色自定义
};

export function getAnnotationColor(type: AnnotationType): string {
  return ANNOTATION_COLORS[type] || ANNOTATION_COLORS.highlight;
}

// ========== 新增标注的参数 ==========

export interface AddAnnotationParams {
  /** 标注的开始时间（秒） */
  startTime: number;
  /** 标注的结束时间（秒） */
  endTime: number;
  /** 被标注的原文文字 */
  text: string;
  /** 所在字幕片段的索引 */
  segmentIndex: number;
  /** 选中文字在片段中的起始字符位置 */
  wordStartIndex: number;
  /** 选中文字在片段中的结束字符位置 */
  wordEndIndex: number;
  /** 标注标题（可选） */
  title?: string;
  /** 标注描述（可选） */
  description?: string;
  /** 标注类型 */
  type: AnnotationType;
  /** 扩展数据 */
  metadata?: Record<string, unknown>;
}

// ========== 单个片段的标注高亮信息（用于列表模式渲染） ==========

export interface SegmentAnnotationHighlight {
  /** 标注 ID */
  id: string;
  /** 字符起始位置 */
  startIndex: number;
  /** 字符结束位置 */
  endIndex: number;
  /** 标注颜色 */
  color: string;
  /** 标注类型 */
  type: AnnotationType;
  /** 标注标题 */
  title?: string;
  /** 标注描述 */
  description?: string;
}

// ========== Hook 参数 ==========

interface UseAnnotationsParams {
  /** 资源 ID */
  resourceId: string;
}

// ========== Hook 返回值 ==========

export interface UseAnnotationsReturn {
  /** 全部标注列表 */
  annotations: AnnotationItem[];
  /** 添加标注 */
  addAnnotation: (params: AddAnnotationParams) => void;
  /** 删除标注 */
  removeAnnotation: (annotationId: string) => void;
  /** 更新标注 */
  updateAnnotation: (annotationId: string, patch: Partial<Pick<AnnotationItem, 'title' | 'description' | 'type' | 'color' | 'metadata'>>) => void;
  /** 获取指定片段的标注高亮信息 */
  getSegmentHighlights: (segmentIndex: number) => SegmentAnnotationHighlight[];
  /** 按片段索引分组的标注映射 */
  annotationsBySegment: Map<number, AnnotationItem[]>;
  /** 是否正在加载 */
  isLoading: boolean;
}

// ========== Hook 实现 ==========

export function useAnnotations({ resourceId }: UseAnnotationsParams): UseAnnotationsReturn {
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const annotationsRef = useRef<AnnotationItem[]>([]);

  // 保持 ref 同步
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // 防抖保存
  const debouncedSave = useMemo(
    () =>
      debounce(async (resId: string, items: AnnotationItem[]) => {
        if (!resId) return;
        try {
          const result = await window.YUA.annotation.save(resId, items);
          if (result.success) {
            console.log('[Annotation] 自动保存成功');
          } else {
            console.error('[Annotation] 自动保存失败:', result.error);
          }
        } catch (error) {
          console.error('[Annotation] 自动保存异常:', error);
        }
      }, 1000),
    []
  );

  // 加载标注数据
  useEffect(() => {
    if (!resourceId) {
      setAnnotations([]);
      return;
    }

    setIsLoading(true);
    isLoadingRef.current = true;

    window.YUA.annotation
      .load(resourceId)
      .then((data) => {
        if (data && Array.isArray(data.annotations)) {
          setAnnotations(data.annotations);
          console.log(`[Annotation] 加载完成，共 ${data.annotations.length} 条标注`);
        } else {
          setAnnotations([]);
        }
      })
      .catch((err) => {
        console.error('[Annotation] 加载失败:', err);
        setAnnotations([]);
      })
      .finally(() => {
        setIsLoading(false);
        setTimeout(() => {
          isLoadingRef.current = false;
        }, 100);
      });
  }, [resourceId]);

  // 标注变更时自动保存
  useEffect(() => {
    if (!resourceId || isLoadingRef.current) return;
    debouncedSave(resourceId, annotations);
  }, [annotations, resourceId, debouncedSave]);

  // 卸载时 flush
  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
  }, [resourceId, debouncedSave]);

  // 添加标注
  const addAnnotation = useCallback((params: AddAnnotationParams) => {
    const now = Date.now();
    const newItem: AnnotationItem = {
      id: uuidv4(),
      startTime: params.startTime,
      endTime: params.endTime,
      text: params.text,
      segmentIndex: params.segmentIndex,
      wordStartIndex: params.wordStartIndex,
      wordEndIndex: params.wordEndIndex,
      title: params.title,
      description: params.description,
      type: params.type,
      color: getAnnotationColor(params.type),
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata
    };
    setAnnotations((prev) => [...prev, newItem]);
  }, []);

  // 删除标注
  const removeAnnotation = useCallback((annotationId: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
  }, []);

  // 更新标注
  const updateAnnotation = useCallback(
    (annotationId: string, patch: Partial<Pick<AnnotationItem, 'title' | 'description' | 'type' | 'color' | 'metadata'>>) => {
      setAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== annotationId) return a;
          const updated = { ...a, ...patch, updatedAt: Date.now() };
          // 类型变更时自动更新颜色（如果没有自定义颜色）
          if (patch.type && !patch.color) {
            updated.color = getAnnotationColor(patch.type);
          }
          return updated;
        })
      );
    },
    []
  );

  // 按片段索引分组
  const annotationsBySegment = useMemo(() => {
    const map = new Map<number, AnnotationItem[]>();
    for (const a of annotations) {
      const list = map.get(a.segmentIndex) || [];
      list.push(a);
      map.set(a.segmentIndex, list);
    }
    return map;
  }, [annotations]);

  // 获取指定片段的高亮信息
  const getSegmentHighlights = useCallback(
    (segmentIndex: number): SegmentAnnotationHighlight[] => {
      const items = annotationsBySegment.get(segmentIndex);
      if (!items || items.length === 0) return [];
      return items.map((a) => ({
        id: a.id,
        startIndex: a.wordStartIndex,
        endIndex: a.wordEndIndex,
        color: a.color || getAnnotationColor(a.type),
        type: a.type,
        title: a.title,
        description: a.description
      }));
    },
    [annotationsBySegment]
  );

  return {
    annotations,
    addAnnotation,
    removeAnnotation,
    updateAnnotation,
    getSegmentHighlights,
    annotationsBySegment,
    isLoading
  };
}
