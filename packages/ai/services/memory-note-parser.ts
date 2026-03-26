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
  let currentKey = '';
  let currentArray: any[] | null = null;
  let currentObject: Record<string, any> | null = null;
  let objectKey = '';

  for (const line of lines) {
    // 空行
    if (line.trim() === '') continue;

    // 数组项
    const arrayMatch = line.match(/^\s{2}-\s+(.+)$/);
    if (arrayMatch && currentArray !== null) {
      const value = parseYamlValue(arrayMatch[1].trim());
      // 检查是否是对象数组项
      const kvMatch = arrayMatch[1].trim().match(/^(\w+):\s*(.+)$/);
      if (kvMatch) {
        currentObject = { [kvMatch[1]]: parseYamlValue(kvMatch[2]) };
        currentArray.push(currentObject);
        objectKey = currentKey;
      } else {
        currentObject = null;
        currentArray.push(value);
      }
      continue;
    }

    // 对象嵌套属性
    const nestedMatch = line.match(/^\s{4}(\w+):\s*(.+)$/);
    if (nestedMatch && currentObject) {
      currentObject[nestedMatch[1]] = parseYamlValue(nestedMatch[2]);
      continue;
    }

    // 2空格嵌套（timeRange 等）
    const subObjMatch = line.match(/^\s{2}(\w+):\s*(.+)$/);
    if (subObjMatch && !currentArray && currentKey) {
      if (typeof result[currentKey] !== 'object' || Array.isArray(result[currentKey])) {
        result[currentKey] = {};
      }
      result[currentKey][subObjMatch[1]] = parseYamlValue(subObjMatch[2]);
      continue;
    }

    // 顶层键值对
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch) {
      const key = topMatch[1];
      const rawVal = topMatch[2].trim();

      currentKey = key;
      currentObject = null;

      if (rawVal === '' || rawVal === '>') {
        // 可能是数组或多行值
        currentArray = [];
        result[key] = currentArray;
      } else {
        currentArray = null;
        result[key] = parseYamlValue(rawVal);
      }
    }
  }

  // 处理多行标量值（summary 等用 > 的字段）：将数组合并为字符串
  for (const key of Object.keys(result)) {
    if (Array.isArray(result[key]) && result[key].length > 0 && typeof result[key][0] === 'string') {
      // 检查是否全是字符串且无对象元素（可能是多行标量）
      // 不合并 topics、keywords 等真正的数组
      // 用 > 标记的字段才合并
    }
  }

  return result;
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
