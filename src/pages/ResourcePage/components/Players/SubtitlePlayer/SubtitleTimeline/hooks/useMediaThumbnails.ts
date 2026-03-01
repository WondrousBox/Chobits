import { useCallback, useEffect, useRef, useState } from 'react';

import type { MediaSegment, MediaThumbnail } from '../types';
import { MEDIA_CONFIG } from '../types';

/**
 * 缩略图缓存项
 */
interface CacheEntry {
  thumbnails: MediaThumbnail[];
  timestamp: number;
}

/**
 * 缩略图缓存（LRU）
 */
class ThumbnailCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxEntries: number;

  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries;
  }

  get(key: string): MediaThumbnail[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 更新访问时间（移到末尾）
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.thumbnails;
  }

  set(key: string, thumbnails: MediaThumbnail[]): void {
    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 检查容量
    if (this.cache.size >= this.maxEntries) {
      // 删除最旧的条目（第一个）
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { thumbnails, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }
}

// 全局缩略图缓存
const globalThumbnailCache = new ThumbnailCache();

/**
 * 生成缓存键
 */
function generateCacheKey(sourceId: string, sourceStart: number | undefined, sourceEnd: number | undefined, count: number): string {
  return `${sourceId}:${sourceStart ?? 0}:${sourceEnd ?? 0}:${count}`;
}

/**
 * useMediaThumbnails - 媒体缩略图管理 Hook
 *
 * 功能：
 * - 自动加载和管理缩略图
 * - LRU 缓存支持
 * - 支持刷新和缓存失效
 */
export function useMediaThumbnails(
  segment: MediaSegment | null,
  options?: {
    /** 是否自动加载 */
    autoLoad?: boolean;
    /** 缩略图数量 */
    thumbnailCount?: number;
    /** 缩略图宽度 */
    thumbnailWidth?: number;
    /** 缩略图高度 */
    thumbnailHeight?: number;
    /** 自定义加载函数 */
    loadThumbnails?: (
      sourceId: string,
      sourceStart: number | undefined,
      sourceEnd: number | undefined,
      count: number,
      width: number,
      height: number
    ) => Promise<MediaThumbnail[]>;
  }
) {
  const {
    autoLoad = true,
    thumbnailCount,
    thumbnailWidth = MEDIA_CONFIG.THUMBNAIL_WIDTH,
    thumbnailHeight = MEDIA_CONFIG.THUMBNAIL_HEIGHT,
    loadThumbnails
  } = options ?? {};

  const [thumbnails, setThumbnails] = useState<MediaThumbnail[]>(segment?.thumbnails ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 使用 ref 避免重复加载
  const loadingRef = useRef(false);
  const lastLoadKeyRef = useRef<string | null>(null);

  // 计算需要的缩略图数量
  const desiredCount = thumbnailCount ?? Math.min(
    MEDIA_CONFIG.MAX_THUMBNAILS_PER_SEGMENT,
    Math.ceil(
      ((segment?.sourceEnd ?? 0) - (segment?.sourceStart ?? 0)) *
      MEDIA_CONFIG.THUMBNAILS_PER_SECOND
    )
  );

  // 加载缩略图
  const load = useCallback(async () => {
    if (!segment || !loadThumbnails) return;

    const cacheKey = generateCacheKey(
      segment.sourceId,
      segment.sourceStart,
      segment.sourceEnd,
      desiredCount
    );

    // 检查是否已经在加载或已加载
    if (loadingRef.current || lastLoadKeyRef.current === cacheKey) {
      return;
    }

    // 检查缓存
    const cached = globalThumbnailCache.get(cacheKey);
    if (cached) {
      setThumbnails(cached);
      lastLoadKeyRef.current = cacheKey;
      return;
    }

    // 如果片段已有缩略图，直接使用
    if (segment.thumbnails && segment.thumbnails.length > 0) {
      setThumbnails(segment.thumbnails);
      globalThumbnailCache.set(cacheKey, segment.thumbnails);
      lastLoadKeyRef.current = cacheKey;
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await loadThumbnails(
        segment.sourceId,
        segment.sourceStart,
        segment.sourceEnd,
        desiredCount,
        thumbnailWidth,
        thumbnailHeight
      );

      globalThumbnailCache.set(cacheKey, result);
      setThumbnails(result);
      lastLoadKeyRef.current = cacheKey;
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载缩略图失败');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [segment, loadThumbnails, desiredCount, thumbnailWidth, thumbnailHeight]);

  // 自动加载
  useEffect(() => {
    if (autoLoad && segment) {
      load();
    }
  }, [autoLoad, segment, load]);

  // 当片段变化时重置状态
  useEffect(() => {
    if (segment) {
      // 如果片段已有缩略图，直接使用
      if (segment.thumbnails && segment.thumbnails.length > 0) {
        setThumbnails(segment.thumbnails);
        setLoading(false);
        setError(null);
        lastLoadKeyRef.current = generateCacheKey(
          segment.sourceId,
          segment.sourceStart,
          segment.sourceEnd,
          desiredCount
        );
      } else {
        // 重置状态以触发重新加载
        lastLoadKeyRef.current = null;
      }
    }
  }, [segment?.id, segment?.sourceId, segment?.sourceStart, segment?.sourceEnd, desiredCount]);

  // 刷新缩略图
  const refresh = useCallback(() => {
    if (!segment) return;

    // 清除缓存
    const cacheKey = generateCacheKey(
      segment.sourceId,
      segment.sourceStart,
      segment.sourceEnd,
      desiredCount
    );
    globalThumbnailCache.delete(cacheKey);
    lastLoadKeyRef.current = null;

    // 重新加载
    load();
  }, [segment, desiredCount, load]);

  // 使缓存失效
  const invalidate = useCallback(() => {
    if (!segment) return;

    const cacheKey = generateCacheKey(
      segment.sourceId,
      segment.sourceStart,
      segment.sourceEnd,
      desiredCount
    );
    globalThumbnailCache.delete(cacheKey);
    lastLoadKeyRef.current = null;
    setThumbnails([]);
  }, [segment, desiredCount]);

  return {
    thumbnails,
    loading,
    error,
    refresh,
    invalidate,
    load
  };
}

/**
 * useMediaThumbnailsBatch - 批量加载缩略图
 *
 * 用于一次性加载多个片段的缩略图
 */
export function useMediaThumbnailsBatch(
  segments: MediaSegment[],
  options?: {
    autoLoad?: boolean;
    loadThumbnails?: (
      sourceId: string,
      sourceStart: number | undefined,
      sourceEnd: number | undefined,
      count: number,
      width: number,
      height: number
    ) => Promise<MediaThumbnail[]>;
  }
) {
  const { autoLoad = true, loadThumbnails } = options ?? {};

  const [thumbnailMap, setThumbnailMap] = useState<Map<string, MediaThumbnail[]>>(new Map());
  const [loadingMap, setLoadingMap] = useState<Map<string, boolean>>(new Map());
  const [errorMap, setErrorMap] = useState<Map<string, string | null>>(new Map());

  const loadBatch = useCallback(async () => {
    if (!loadThumbnails) return;

    const newThumbnailMap = new Map(thumbnailMap);
    const newLoadingMap = new Map(loadingMap);
    const newErrorMap = new Map(errorMap);

    const promises = segments.map(async (segment) => {
      // 如果已有缩略图，跳过
      if (segment.thumbnails && segment.thumbnails.length > 0) {
        newThumbnailMap.set(segment.id, segment.thumbnails);
        return;
      }

      const desiredCount = Math.min(
        MEDIA_CONFIG.MAX_THUMBNAILS_PER_SEGMENT,
        Math.ceil(
          (segment.sourceEnd ?? 0 - (segment.sourceStart ?? 0)) *
          MEDIA_CONFIG.THUMBNAILS_PER_SECOND
        )
      );

      const cacheKey = generateCacheKey(
        segment.sourceId,
        segment.sourceStart,
        segment.sourceEnd,
        desiredCount
      );

      // 检查缓存
      const cached = globalThumbnailCache.get(cacheKey);
      if (cached) {
        newThumbnailMap.set(segment.id, cached);
        return;
      }

      newLoadingMap.set(segment.id, true);
      newErrorMap.set(segment.id, null);

      try {
        const result = await loadThumbnails(
          segment.sourceId,
          segment.sourceStart,
          segment.sourceEnd,
          desiredCount,
          MEDIA_CONFIG.THUMBNAIL_WIDTH,
          MEDIA_CONFIG.THUMBNAIL_HEIGHT
        );

        globalThumbnailCache.set(cacheKey, result);
        newThumbnailMap.set(segment.id, result);
      } catch (err) {
        newErrorMap.set(segment.id, err instanceof Error ? err.message : '加载缩略图失败');
      } finally {
        newLoadingMap.set(segment.id, false);
      }
    });

    await Promise.all(promises);

    setThumbnailMap(newThumbnailMap);
    setLoadingMap(newLoadingMap);
    setErrorMap(newErrorMap);
  }, [segments, loadThumbnails, thumbnailMap, loadingMap, errorMap]);

  useEffect(() => {
    if (autoLoad) {
      loadBatch();
    }
  }, [autoLoad, loadBatch]);

  return {
    thumbnailMap,
    loadingMap,
    errorMap,
    refresh: loadBatch
  };
}

/**
 * 清除所有缩略图缓存
 */
export function clearThumbnailCache(): void {
  globalThumbnailCache.clear();
}
