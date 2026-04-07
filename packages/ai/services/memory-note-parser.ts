/**
 * Memory Note Parser
 * 解析 Memory Note Markdown 文件：读取 frontmatter、拆分 sections、定位行号。
 */

import type { MemoryNoteFrontmatter, MemoryNoteSectionIndex } from './memory-types';

// ━━ Frontmatter Parsing ━━

/**
 * 从 Markdown 文件内容解析 YAML frontmatter
 * 返回 frontmatter 对象和 frontmatter 结束后的行号
 */
export function parseFrontmatter(content: string): { frontmatter: MemoryNoteFrontmatter | null; bodyStartLine: number } {
  const lines = content.split('\n');

  // 查找 frontmatter 起止
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: null, bodyStartLine: 1 };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      endIndex = i;
      break;
    }
  }
  if (endIndex < 0) {
    return { frontmatter: null, bodyStartLine: 1 };
  }

  const yamlContent = lines.slice(1, endIndex).join('\n');
  const frontmatter = parseSimpleYaml(yamlContent);

  return {
    frontmatter: frontmatter as MemoryNoteFrontmatter,
    bodyStartLine: endIndex + 2 // 1-based, skip the closing ---
  };
}

// ━━ Section Parsing ━━

/**
 * 从 Markdown 正文中拆分 sections（## 和 ### 级别）
 * 返回每个 section 的标题、摘要、行号范围等信息
 */
export function parseSections(content: string, noteId: string): MemoryNoteSectionIndex[] {
  const lines = content.split('\n');

  // 跳过 frontmatter
  const { bodyStartLine } = parseFrontmatter(content);
  const sections: MemoryNoteSectionIndex[] = [];

  let currentHeading = '';
  let currentLevel = 0;
  let currentLineStart = 0;
  let currentSummary = '';
  let currentKeywords: string[] = [];
  let sectionOrder = 0;
  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  for (let i = bodyStartLine - 1; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1; // 1-based

    // 检测 ## 或 ### 标题
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);

    if (headingMatch) {
      // 保存前一个 section
      if (currentHeading && currentLineStart > 0) {
        sections.push({
          noteId,
          heading: currentHeading,
          headingLevel: currentLevel,
          summary: currentSummary.trim(),
          keywords: currentKeywords,
          lineStart: currentLineStart,
          lineEnd: lineNum - 1,
          charCount: countChars(lines, currentLineStart - 1, lineNum - 2)
        });
        sectionOrder++;
      }

      // 开始新 section
      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      currentHeading = heading;
      currentLevel = level;
      currentLineStart = lineNum;
      currentSummary = '';
      currentKeywords = [];
      inBlockquote = false;
      blockquoteLines = [];
      continue;
    }

    // 检测 blockquote（> 开头的行，作为段落摘要）
    if (currentHeading && line.startsWith('>')) {
      inBlockquote = true;
      blockquoteLines.push(line.replace(/^>\s*/, '').trim());
      continue;
    }

    // blockquote 结束
    if (inBlockquote && !line.startsWith('>') && line.trim() !== '') {
      currentSummary = blockquoteLines.join(' ');
      inBlockquote = false;
    }
  }

  // 保存最后一个 section
  if (currentHeading && currentLineStart > 0) {
    sections.push({
      noteId,
      heading: currentHeading,
      headingLevel: currentLevel,
      summary: currentSummary.trim() || blockquoteLines.join(' ').trim(),
      keywords: currentKeywords,
      lineStart: currentLineStart,
      lineEnd: lines.length,
      charCount: countChars(lines, currentLineStart - 1, lines.length - 1)
    });
  }

  return sections;
}

/**
 * 从 Markdown 文件按行号范围读取内容
 */
export function readLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split('\n');
  return lines.slice(startLine - 1, endLine).join('\n');
}

/**
 * 提取 section 内的 blockquote 作为摘要
 */
export function extractBlockquoteSummary(sectionContent: string): string {
  const lines = sectionContent.split('\n');
  const bqLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('>')) {
      bqLines.push(line.replace(/^>\s*/, '').trim());
    } else if (bqLines.length > 0) {
      break; // 只取第一个连续的 blockquote
    }
  }
  return bqLines.join(' ').trim();
}

// ━━ Simple YAML Parser ━━

/**
 * 简单 YAML 解析器（仅支持 memory note frontmatter 的子集）
 * 不依赖外部 yaml 库。支持字符串、数字、数组、嵌套对象。
 */
function parseSimpleYaml(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line || line.trim() === '') {
      index++;
      continue;
    }

    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!topMatch) {
      index++;
      continue;
    }

    const key = topMatch[1];
    const rawVal = topMatch[2].trim();

    if (rawVal === '>') {
      const foldedLines: string[] = [];
      index++;
      while (index < lines.length) {
        const foldedLine = lines[index];
        if (/^\s{2}/.test(foldedLine)) {
          foldedLines.push(foldedLine.replace(/^\s{2}/, ''));
          index++;
          continue;
        }
        if (foldedLine.trim() === '') {
          foldedLines.push('');
          index++;
          continue;
        }
        break;
      }
      result[key] = foldedLines.join('\n').trim();
      continue;
    }

    if (rawVal !== '') {
      result[key] = parseYamlValue(rawVal);
      index++;
      continue;
    }

    const nextLine = lines[index + 1] || '';
    if (/^\s{2}-\s+/.test(nextLine)) {
      const parsedArray = parseYamlArray(lines, index + 1);
      result[key] = parsedArray.value;
      index = parsedArray.nextIndex;
      continue;
    }

    if (/^\s{2}\w+:\s*/.test(nextLine)) {
      const parsedObject = parseYamlObject(lines, index + 1);
      result[key] = parsedObject.value;
      index = parsedObject.nextIndex;
      continue;
    }

    result[key] = '';
    index++;
  }

  return result;
}

function parseYamlArray(lines: string[], startIndex: number): { value: any[]; nextIndex: number } {
  const value: any[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!/^\s{2}-\s+/.test(line)) break;

    const itemRaw = line.replace(/^\s{2}-\s+/, '').trim();
    const kvMatch = itemRaw.match(/^(\w+):\s*(.*)$/);

    if (!kvMatch) {
      value.push(parseYamlValue(itemRaw));
      index++;
      continue;
    }

    const item: Record<string, any> = {
      [kvMatch[1]]: parseYamlValue(kvMatch[2])
    };
    index++;

    while (index < lines.length) {
      const nestedLine = lines[index];
      const nestedMatch = nestedLine.match(/^\s{4}(\w+):\s*(.*)$/);
      if (!nestedMatch) break;
      item[nestedMatch[1]] = parseYamlValue(nestedMatch[2]);
      index++;
    }

    value.push(item);
  }

  return { value, nextIndex: index };
}

function parseYamlObject(lines: string[], startIndex: number): { value: Record<string, any>; nextIndex: number } {
  const value: Record<string, any> = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const match = line.match(/^\s{2}(\w+):\s*(.*)$/);
    if (!match) break;
    value[match[1]] = parseYamlValue(match[2]);
    index++;
  }

  return { value, nextIndex: index };
}

function parseYamlValue(raw: string): any {
  // 去掉引号
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  // 数字
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return parseFloat(raw);
  }
  // 布尔
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  return raw;
}

// ━━ Helpers ━━

function countChars(lines: string[], startIdx: number, endIdx: number): number {
  let count = 0;
  for (let i = startIdx; i <= Math.min(endIdx, lines.length - 1); i++) {
    count += (lines[i]?.length ?? 0) + 1; // +1 for newline
  }
  return count;
}
