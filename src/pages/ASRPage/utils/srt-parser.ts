import { RecognizedSegment } from '../types';

/**
 * 解析 SRT 字幕文件内容为 RecognizedSegment 数组
 * SRT 格式:
 * 1
 * 00:00:00,000 --> 00:00:02,500
 * 字幕文本
 *
 * 2
 * 00:00:02,500 --> 00:00:05,000
 * 另一段字幕
 */
export function parseSrtContent(srtContent: string): RecognizedSegment[] {
  const segments: RecognizedSegment[] = [];

  if (!srtContent || !srtContent.trim()) {
    return segments;
  }

  // 按空行分割成块
  const blocks = srtContent.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');

    if (lines.length < 3) continue;

    // 第一行是序号（忽略）
    // 第二行是时间戳
    const timeLine = lines[1];
    // 第三行及之后是文本
    const text = lines.slice(2).join('\n');

    // 解析时间戳: 00:00:00,000 --> 00:00:02,500
    const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);

    if (!timeMatch) continue;

    const startMs = parseTimeToMs(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
    const endMs = parseTimeToMs(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);

    segments.push({
      id: segments.length,
      text: text.trim(),
      start: startMs / 1000, // 转换为秒
      end: endMs / 1000,
      isFinal: true
    });
  }

  return segments;
}

/**
 * 将时间部分转换为毫秒
 */
function parseTimeToMs(hours: string, minutes: string, seconds: string, ms: string): number {
  return parseInt(hours) * 3600000 + parseInt(minutes) * 60000 + parseInt(seconds) * 1000 + parseInt(ms);
}

/**
 * 格式化毫秒为时间显示 (mm:ss)
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
