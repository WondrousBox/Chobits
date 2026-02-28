/**
 * 字幕编辑 → segments.json 同步工具
 *
 * 当用户编辑 SRT 字幕文本时，同步更新对应的 segments.json 中的 children（字级别时间戳）。
 *
 * 核心思路：
 * 1. 通过 st/et 时间戳匹配将 subtitleEntry 与 segmentData 对应起来
 * 2. 当文本发生变更时，将新文本映射回 children：
 *    - 按 children 的文本顺序拼接出原文，计算每个 child 的字符范围
 *    - 用最长公共子序列 (LCS) 对比新旧文本，推断出每个 child 的新文本
 *    - 如果某个 child 的文本被完全删除，则移除该 child
 *    - 如果某个 child 的文本被修改（部分删除/插入），则更新其 text，保留时间戳
 * 3. 如果没有 children，直接更新 segment 的 text 即可
 */

import { type AimSegments, utils } from '@aim-packages/subtitle';

/** 时间戳匹配阈值（秒） */
const TIME_MATCH_THRESHOLD = 0.05;

/**
 * 用 LCS (Longest Common Subsequence) 对齐旧文本和新文本的字符
 * 返回 LCS 对齐结果：每个元素是 [oldIndex, newIndex]
 */
function lcsAlign(oldText: string, newText: string): Array<[number, number]> {
  const m = oldText.length;
  const n = newText.length;

  // 优化：对于较长文本使用滚动数组来节省内存
  // dp[i][j] = LCS长度 of oldText[0..i-1] and newText[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldText[i - 1] === newText[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯找出对齐的字符对
  const aligned: Array<[number, number]> = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldText[i - 1] === newText[j - 1]) {
      aligned.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  aligned.reverse();
  return aligned;
}

/**
 * 计算每个 child 在拼接原文中的字符范围 [start, end)
 */
function computeChildRanges(children: Array<{ text: string }>): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let offset = 0;
  for (const child of children) {
    const len = child.text.length;
    ranges.push({ start: offset, end: offset + len });
    offset += len;
  }
  return ranges;
}

/**
 * 根据编辑后的新文本，同步更新 segment 的 children
 *
 * @param children 原始 children 数组（有 st, et, text）
 * @param oldText  原始拼接文本（由 children 的 text 拼接而成）
 * @param newText  用户编辑后的新文本
 * @returns 更新后的 children 数组（已删除空 children），如果无法同步则返回 null
 */
export function syncChildrenWithEdit(children: Array<{ st: string; et: string; text: string }>, oldText: string, newText: string): Array<{ st: string; et: string; text: string }> | null {
  if (!children || children.length === 0) return null;
  if (oldText === newText) return children; // 无变更

  const ranges = computeChildRanges(children);

  // 用 LCS 对齐旧文本和新文本
  const aligned = lcsAlign(oldText, newText);

  // 为每个 child 收集其对应的新文本字符
  // 策略：
  // 1. 对齐的字符保持归属于原来的 child
  // 2. 新文本中未对齐的字符（插入的字符）归属于 "最近的前一个对齐字符所在的 child"
  //    如果在所有对齐字符之前插入，则归属于第一个 child

  // 为新文本的每个字符确定归属 child index
  const newCharOwner: number[] = new Array(newText.length).fill(-1);

  // 首先处理对齐字符：新文本中对齐的字符继承旧文本中的 child 归属
  for (const [oldIdx, newIdx] of aligned) {
    // 找出 oldIdx 属于哪个 child
    let childIdx = -1;
    for (let c = 0; c < ranges.length; c++) {
      if (oldIdx >= ranges[c].start && oldIdx < ranges[c].end) {
        childIdx = c;
        break;
      }
    }
    if (childIdx >= 0) {
      newCharOwner[newIdx] = childIdx;
    }
  }

  // 然后处理未对齐的字符（插入的字符）：寻找最近的归属
  // 从左到右扫描，未归属的字符继承右边最近已填充字符的归属
  // 先从右到左填充（插入的字符跟随后面的 child）
  // 策略：插入的字符跟随其后方最近的已归属字符
  // 如果后方没有，则跟随前方
  let lastKnown = -1;
  // 从右到左：未归属的跟随右边的 child
  for (let i = newText.length - 1; i >= 0; i--) {
    if (newCharOwner[i] >= 0) {
      lastKnown = newCharOwner[i];
    } else if (lastKnown >= 0) {
      newCharOwner[i] = lastKnown;
    }
  }
  // 从左到右：仍未归属的跟随左边的 child
  lastKnown = -1;
  for (let i = 0; i < newText.length; i++) {
    if (newCharOwner[i] >= 0) {
      lastKnown = newCharOwner[i];
    } else if (lastKnown >= 0) {
      newCharOwner[i] = lastKnown;
    }
  }

  // 如果还有未归属的（所有字符都是新插入且无对齐参考），归属于第一个 child
  for (let i = 0; i < newText.length; i++) {
    if (newCharOwner[i] < 0) {
      newCharOwner[i] = 0;
    }
  }

  // 按 child 收集新文本
  const newChildTexts: string[] = children.map(() => '');
  for (let i = 0; i < newText.length; i++) {
    const ci = newCharOwner[i];
    if (ci >= 0 && ci < children.length) {
      newChildTexts[ci] += newText[i];
    }
  }

  // 构建更新后的 children：删除文本为空的 child（完全删除），更新其余的 text
  const result: Array<{ st: string; et: string; text: string }> = [];
  for (let c = 0; c < children.length; c++) {
    const trimmed = newChildTexts[c];
    if (trimmed.length > 0) {
      result.push({
        st: children[c].st,
        et: children[c].et,
        text: trimmed
      });
    }
    // 文本为空的 child 被完全删除，跳过
  }

  return result.length > 0 ? result : null;
}

/**
 * 根据用户编辑后的 subtitleEntries，同步更新 segmentsData
 *
 * @param segmentsData 当前的 segments 数据（含 children）
 * @param oldEntries   编辑前的 subtitleEntries 快照
 * @param newEntries   编辑后的 subtitleEntries
 * @returns 更新后的 segmentsData（原地修改副本），如果无需更新返回 null
 */
export function syncSegmentsWithEntries(segmentsData: AimSegments[], oldEntries: AimSegments[], newEntries: AimSegments[]): AimSegments[] | null {
  if (!segmentsData || segmentsData.length === 0) return null;

  let hasChanges = false;
  const updated = segmentsData.map((seg) => ({ ...seg }));

  for (let i = 0; i < newEntries.length; i++) {
    const newEntry = newEntries[i];
    const oldEntry = oldEntries[i];

    // 跳过未变更的条目
    if (!oldEntry || !newEntry || oldEntry.text === newEntry.text) continue;

    // 通过时间戳找到对应的 segment（匹配旧条目的时间）
    const oldSt = utils.convertToSeconds(oldEntry.st);
    const oldEt = utils.convertToSeconds(oldEntry.et);

    const segIdx = updated.findIndex((s) => {
      const sSt = utils.convertToSeconds(s.st);
      const sEt = utils.convertToSeconds(s.et);
      return Math.abs(sSt - oldSt) < TIME_MATCH_THRESHOLD && Math.abs(sEt - oldEt) < TIME_MATCH_THRESHOLD;
    });

    if (segIdx < 0) continue; // 没有匹配的 segment

    const seg = updated[segIdx];

    // 更新 segment 的顶层文本
    seg.text = newEntry.text;

    // 如果有 children，同步更新
    if (seg.children && seg.children.length > 0) {
      const childrenTyped = seg.children as Array<{ st: string; et: string; text: string }>;
      const oldChildText = childrenTyped.map((c) => c.text).join('');
      const newChildrenResult = syncChildrenWithEdit(childrenTyped, oldChildText, newEntry.text);

      if (newChildrenResult === null) {
        // 所有 children 都被删除了，清空 children
        seg.children = undefined as any;
      } else {
        seg.children = newChildrenResult as AimSegments[];
      }
      hasChanges = true;
    } else {
      // 无 children，仅更新顶层 text
      hasChanges = true;
    }
  }

  return hasChanges ? updated : null;
}

/**
 * 判断两个 segments 数据是否需要同步（是否有 children 数据）
 */
export function hasSegmentsChildren(segmentsData: AimSegments[] | null): boolean {
  if (!segmentsData) return false;
  return segmentsData.some((s) => s.children && s.children.length > 0);
}

/**
 * 当字幕块时间被拖拽调整时，同步更新对应 segment 及其 children 的时间戳
 *
 * @param segmentsData 当前完整的 segments 数据
 * @param originalSt   原始开始时间（秒）
 * @param originalEt   原始结束时间（秒）
 * @param newSt        新开始时间（秒）
 * @param newEt        新结束时间（秒）
 * @returns 更新后的 segmentsData，如果无需更新返回 null
 */
export function shiftSegmentTime(segmentsData: AimSegments[], originalSt: number, originalEt: number, newSt: number, newEt: number): AimSegments[] | null {
  if (!segmentsData || segmentsData.length === 0) return null;

  // 计算时间偏移量
  const offset = newSt - originalSt;
  const durationChange = newEt - newSt - (originalEt - originalSt);

  // 找到匹配的 segment
  const segIdx = segmentsData.findIndex((s) => {
    const sSt = utils.convertToSeconds(s.st);
    const sEt = utils.convertToSeconds(s.et);
    return Math.abs(sSt - originalSt) < TIME_MATCH_THRESHOLD && Math.abs(sEt - originalEt) < TIME_MATCH_THRESHOLD;
  });

  if (segIdx < 0) return null;

  const seg = segmentsData[segIdx];
  const updated = [...segmentsData];
  const newSeg = { ...seg };

  // 更新 segment 的顶层时间
  newSeg.st = utils.formatTime(newSt);
  newSeg.et = utils.formatTime(newEt);

  // 如果有 children，按比例调整每个 child 的时间戳
  if (seg.children && seg.children.length > 0) {
    const originalDuration = originalEt - originalSt;
    const newDuration = newEt - newSt;
    const scale = originalDuration > 0 ? newDuration / originalDuration : 1;

    newSeg.children = (seg.children as Array<{ st: string; et: string; text: string }>).map((child) => {
      const childSt = utils.convertToSeconds(child.st);
      const childEt = utils.convertToSeconds(child.et);

      // 计算相对于 segment 开始的偏移
      const relativeSt = childSt - originalSt;
      const relativeEt = childEt - originalSt;

      // 按比例缩放后再加上新的起始时间
      const newChildSt = newSt + relativeSt * scale;
      const newChildEt = newSt + relativeEt * scale;

      return {
        ...child,
        st: utils.formatTime(newChildSt),
        et: utils.formatTime(newChildEt)
      };
    }) as AimSegments[];
  }

  updated[segIdx] = newSeg;
  return updated;
}

/**
 * 合并两个相邻 segment 的 children（用于字幕行合并操作）
 *
 * @param segmentsData 当前完整的 segments 数据
 * @param mergedEntry  合并后的 subtitleEntry（包含 st, et, text）
 * @param seg1St       第一个原始片段的开始时间
 * @param seg2Et       第二个原始片段的结束时间
 * @returns 更新后的 segmentsData，如果无需更新返回 null
 */
export function mergeSegmentsChildren(segmentsData: AimSegments[], mergedEntry: AimSegments, seg1St: string, seg2Et: string): AimSegments[] | null {
  if (!segmentsData || segmentsData.length === 0) return null;

  const s1St = utils.convertToSeconds(seg1St);
  const s2Et = utils.convertToSeconds(seg2Et);

  // 找到两个原始 segment 的索引
  let idx1 = -1;
  let idx2 = -1;
  for (let i = 0; i < segmentsData.length; i++) {
    const sSt = utils.convertToSeconds(segmentsData[i].st);
    const sEt = utils.convertToSeconds(segmentsData[i].et);
    if (idx1 < 0 && Math.abs(sSt - s1St) < TIME_MATCH_THRESHOLD) {
      idx1 = i;
    }
    if (Math.abs(sEt - s2Et) < TIME_MATCH_THRESHOLD) {
      idx2 = i;
    }
  }

  if (idx1 < 0 || idx2 < 0 || idx1 >= idx2) return null;

  const seg1 = segmentsData[idx1];
  const seg2 = segmentsData[idx2];

  // 合并 children
  const mergedChildren: AimSegments[] = [];
  if (seg1.children) mergedChildren.push(...seg1.children);
  if (seg2.children) mergedChildren.push(...seg2.children);

  // 创建合并后的 segment
  const mergedSeg: AimSegments = {
    st: mergedEntry.st,
    et: mergedEntry.et,
    text: mergedEntry.text,
    ...(mergedChildren.length > 0 ? { children: mergedChildren } : {})
  };

  // 替换 idx1 处的 segment，删除 idx2 处的 segment
  const updated = [...segmentsData];
  updated[idx1] = mergedSeg;
  updated.splice(idx2, 1);

  return updated;
}
