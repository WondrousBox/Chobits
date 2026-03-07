/**
 * 卡拉OK式 ASS 字幕生成器
 *
 * 使用 ASS 的 \kf (smooth karaoke fill) 标签实现字级别的逐字高亮效果。
 * 格式: {\kfDURATION}text  — DURATION 单位为厘秒 (1/100秒)
 *
 * 需要 segments 数据中包含 children (字级别时间戳) 才能生成卡拉OK效果，
 * 否则回退为普通 ASS 字幕。
 */

import { utils } from '@aim-packages/subtitle';

import type { SubtitleStyleConfig } from './types';
import { DEFAULT_SUBTITLE_STYLE } from './types';

/** 原始 segments 数据格式（来自 segments.json） */
export interface RawSegment {
  st: string;
  et: string;
  text: string;
  children?: Array<{
    st: string;
    et: string;
    text: string;
  }>;
}

/**
 * 将秒数转换为 ASS 时间格式 H:MM:SS.CC
 */
function secondsToAssTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const sInt = Math.floor(s);
  const cs = Math.round((s - sInt) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sInt).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * 将 SubtitleStyleConfig 转换为 ASS Style 行
 */
function buildAssStyleLine(style: SubtitleStyleConfig): string {
  const fontName = style.fontName || 'Microsoft YaHei';
  const fontSize = style.fontSize || 48;
  const primaryColor = style.primaryColor || '&HFFFFFF';
  const outlineColor = style.outlineColor || '&H000000';
  const backColor = style.backColor || '&H80000000';
  const bold = style.bold ? -1 : 0;
  const italic = style.italic ? -1 : 0;
  const borderStyle = style.borderStyle || '1';
  const outline = style.outlineWidth ?? 2;
  const shadow = style.shadowDepth ?? 1;
  const alignment = style.alignment || '2';
  const marginV = style.marginV ?? 30;

  // ASS Style 格式:
  // Style: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour,
  //        BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing,
  //        Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
  return `Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},${bold},${italic},0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},10,10,${marginV},134`;
}

/**
 * 为单个 Dialogue 事件构建卡拉OK标签文本
 *
 * 每个子词的高亮持续时间 = word.et - word.st（秒），换算为厘秒后作为 \kf 参数。
 * 使用 \kf（smooth fill）提供平滑的从左到右填充效果。
 */
function buildKaraokeText(children: Array<{ st: string; et: string; text: string }>): string {
  return children
    .map((word) => {
      const st = utils.convertToSeconds(word.st);
      const et = utils.convertToSeconds(word.et);
      const durationCs = Math.max(1, Math.round((et - st) * 100)); // 厘秒，最小1
      return `{\\kf${durationCs}}${word.text}`;
    })
    .join('');
}

/**
 * 生成卡拉OK ASS 字幕内容
 *
 * @param segments - 原始 segments 数据（包含 children 字级别时间戳）
 * @param style - 字幕样式配置
 * @returns ASS 字幕文件内容字符串
 */
export function generateKaraokeAss(segments: RawSegment[], style?: SubtitleStyleConfig): string {
  const effectiveStyle = style || DEFAULT_SUBTITLE_STYLE;

  // 构建 ASS 头部
  const header = [
    '[Script Info]',
    'Title: Karaoke Subtitle',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    buildAssStyleLine(effectiveStyle),
    // 卡拉OK 高亮样式：SecondaryColour 用于 \kf 填充前的颜色
    // PrimaryColour 是高亮后的颜色，SecondaryColour 是高亮前的颜色
    `Style: Karaoke,${effectiveStyle.fontName || 'Microsoft YaHei'},${effectiveStyle.fontSize || 48},${effectiveStyle.primaryColor || '&HFFFFFF'},&H00808080,${effectiveStyle.outlineColor || '&H000000'},${effectiveStyle.backColor || '&H80000000'},${effectiveStyle.bold ? -1 : 0},${effectiveStyle.italic ? -1 : 0},0,0,100,100,0,0,${effectiveStyle.borderStyle || '1'},${effectiveStyle.outlineWidth ?? 2},${effectiveStyle.shadowDepth ?? 1},${effectiveStyle.alignment || '2'},10,10,${effectiveStyle.marginV ?? 30},134`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];

  // 构建 Dialogue 事件
  const dialogues: string[] = [];
  let karaokeLineCount = 0;

  for (const seg of segments) {
    if (!seg.text) continue;

    const st = utils.convertToSeconds(seg.st);
    const et = utils.convertToSeconds(seg.et);
    const startTime = secondsToAssTime(st);
    const endTime = secondsToAssTime(et);
    const text = seg.text.replace(/\r?\n/g, '\\N');

    if (seg.children && seg.children.length > 0) {
      // 有字级别时间戳 → 使用卡拉OK效果
      const karaokeText = buildKaraokeText(seg.children);
      dialogues.push(`Dialogue: 0,${startTime},${endTime},Karaoke,NTP,0000,0000,0000,,${karaokeText}`);
      karaokeLineCount++;
    } else {
      // 无字级别时间戳 → 普通字幕
      dialogues.push(`Dialogue: 0,${startTime},${endTime},Default,NTP,0000,0000,0000,,${text}`);
    }
  }

  console.log(`[karaokeAss] 生成 ${dialogues.length} 条字幕，其中 ${karaokeLineCount} 条带卡拉OK效果`);

  return [...header, ...dialogues, ''].join('\n');
}

/**
 * 检查 segments 数据是否包含字级别时间戳（至少有一个片段带 children）
 */
export function hasWordLevelTimestamps(segments: RawSegment[] | null | undefined): boolean {
  if (!segments || segments.length === 0) return false;
  return segments.some((seg) => seg.children && seg.children.length > 0);
}

/**
 * 生成带自定义样式的 ASS 字幕内容（无卡拉OK效果）
 *
 * @param segments - 字幕片段数组（AimSegments 格式）
 * @param style - 字幕样式配置
 * @returns ASS 字幕文件内容字符串
 */
export function generateAss(segments: Array<{ st: string; et: string; text: string }>, style?: SubtitleStyleConfig): string {
  const effectiveStyle = style || DEFAULT_SUBTITLE_STYLE;

  // 构建 ASS 头部
  const header = [
    '[Script Info]',
    'Title: Subtitle',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    buildAssStyleLine(effectiveStyle),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];

  // 构建 Dialogue 事件
  const dialogues: string[] = [];

  for (const seg of segments) {
    if (!seg.text) continue;

    const st = utils.convertToSeconds(seg.st);
    const et = utils.convertToSeconds(seg.et);
    const startTime = secondsToAssTime(st);
    const endTime = secondsToAssTime(et);
    const text = seg.text.replace(/\r?\n/g, '\\N');

    dialogues.push(`Dialogue: 0,${startTime},${endTime},Default,NTP,0000,0000,0000,,${text}`);
  }

  return [...header, ...dialogues, ''].join('\n');
}
