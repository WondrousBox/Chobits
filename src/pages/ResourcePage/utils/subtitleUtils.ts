import { ResourceItem } from '../types';

// 字幕文件扩展名
const SUBTITLE_EXTENSIONS = new Set(['srt', 'vtt', 'ass']);

/**
 * 判断文件是否为字幕文件
 */
export function isSubtitleFile(filePath?: string): boolean {
  if (!filePath) return false;
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext ? SUBTITLE_EXTENSIONS.has(ext) : false;
}

/**
 * 获取文件名（不含扩展名）
 * 例如：/path/to/video.mp4 -> video
 */
export function getFileNameWithoutExtension(filePath?: string): string {
  if (!filePath) return '';
  const fileName = filePath.split(/[/\\]/).pop() || '';
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) return fileName;
  return fileName.substring(0, lastDotIndex);
}

/**
 * 判断两个文件是否为同名文件（忽略扩展名）
 */
export function isSameBaseName(filePath1?: string, filePath2?: string): boolean {
  if (!filePath1 || !filePath2) return false;
  const name1 = getFileNameWithoutExtension(filePath1).toLowerCase();
  const name2 = getFileNameWithoutExtension(filePath2).toLowerCase();
  return name1 === name2 && name1 !== '';
}

/**
 * 字幕信息接口
 */
export interface SubtitleInfo {
  id: string;
  filePath: string;
  extension: string;
}

/**
 * 扩展的 ResourceItem，包含字幕信息
 */
export interface ResourceItemWithSubtitles extends ResourceItem {
  subtitles?: SubtitleInfo[];
}

/**
 * 合并视频和字幕文件
 * @param items 资源项列表
 * @returns 合并后的资源项列表（字幕已合并到视频中，单独的字幕项已被过滤）
 */
export function mergeVideoWithSubtitles(items: ResourceItem[]): ResourceItemWithSubtitles[] {
  // 分离视频和字幕
  const videos: ResourceItem[] = [];
  const subtitles: ResourceItem[] = [];
  const others: ResourceItem[] = [];

  items.forEach((item) => {
    if (item.type === 'video' || (item.filePath && /\.(mp4|webm|ogg|mov|mkv|ogv|avi|m4v)$/i.test(item.filePath))) {
      videos.push(item);
    } else if (isSubtitleFile(item.filePath)) {
      subtitles.push(item);
    } else {
      others.push(item);
    }
  });

  // 创建字幕映射：baseName -> SubtitleInfo[]
  const subtitleMap = new Map<string, SubtitleInfo[]>();
  subtitles.forEach((subtitle) => {
    const baseName = getFileNameWithoutExtension(subtitle.filePath).toLowerCase();
    if (!subtitleMap.has(baseName)) {
      subtitleMap.set(baseName, []);
    }
    const ext = subtitle.filePath?.split('.').pop()?.toLowerCase() || '';
    subtitleMap.get(baseName)!.push({
      id: subtitle.id,
      filePath: subtitle.filePath || '',
      extension: ext
    });
  });

  // 合并视频和字幕
  const mergedVideos: ResourceItemWithSubtitles[] = videos.map((video) => {
    const baseName = getFileNameWithoutExtension(video.filePath).toLowerCase();
    const matchedSubtitles = subtitleMap.get(baseName) || [];

    if (matchedSubtitles.length > 0) {
      return {
        ...video,
        subtitles: matchedSubtitles
      };
    }
    return video;
  });

  // 返回合并后的视频 + 其他资源（字幕已被过滤）
  return [...mergedVideos, ...others];
}
