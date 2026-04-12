/**
 * Memory Note Parser
 * Parse Memory Note Markdown files into frontmatter and section indexes.
 */

import type { MemoryNoteFrontmatter, MemoryNoteSectionIndex } from './memory-types';

/**
 * Parse YAML frontmatter from a Markdown document.
 * Returns the parsed frontmatter plus the 1-based line where the body starts.
 */
export function parseFrontmatter(content: string): { frontmatter: MemoryNoteFrontmatter | null; bodyStartLine: number } {
  const lines = content.split('\n');

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
    bodyStartLine: endIndex + 2
  };
}

/**
 * Parse `##` and `###` sections from a note body.
 */
export function parseSections(content: string, noteId: string): MemoryNoteSectionIndex[] {
  const lines = content.split('\n');
  const { bodyStartLine } = parseFrontmatter(content);
  const sections: MemoryNoteSectionIndex[] = [];

  let currentHeading = '';
  let currentLevel = 0;
  let currentLineStart = 0;
  let currentSummary = '';
  let currentKeywords: string[] = [];
  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  for (let i = bodyStartLine - 1; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);

    if (headingMatch) {
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
      }

      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentLineStart = lineNum;
      currentSummary = '';
      currentKeywords = [];
      inBlockquote = false;
      blockquoteLines = [];
      continue;
    }

    if (currentHeading && line.startsWith('>')) {
      inBlockquote = true;
      blockquoteLines.push(line.replace(/^>\s*/, '').trim());
      continue;
    }

    if (inBlockquote && !line.startsWith('>') && line.trim() !== '') {
      currentSummary = blockquoteLines.join(' ');
      inBlockquote = false;
    }
  }

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
 * Read a 1-based line range from Markdown content.
 */
export function readLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split('\n');
  return lines.slice(startLine - 1, endLine).join('\n');
}

/**
 * Extract the first continuous blockquote block from a section as summary text.
 */
export function extractBlockquoteSummary(sectionContent: string): string {
  const lines = sectionContent.split('\n');
  const blockquoteLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('>')) {
      blockquoteLines.push(line.replace(/^>\s*/, '').trim());
    } else if (blockquoteLines.length > 0) {
      break;
    }
  }

  return blockquoteLines.join(' ').trim();
}

interface YamlState {
  lines: string[];
  index: number;
}

function parseSimpleYaml(yaml: string): Record<string, any> {
  const state: YamlState = {
    lines: yaml.split('\n'),
    index: 0
  };

  return parseYamlObjectBlock(state, 0);
}

function parseYamlObjectBlock(state: YamlState, indent: number): Record<string, any> {
  const value: Record<string, any> = {};

  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (line.trim() === '') {
      state.index++;
      continue;
    }

    const lineIndent = getIndent(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) break;

    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) break;

    const match = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      state.index++;
      continue;
    }

    const [, key, rawValue] = match;
    state.index++;

    if (rawValue === '>') {
      value[key] = parseFoldedBlock(state, indent + 2);
      continue;
    }

    if (rawValue !== '') {
      value[key] = parseYamlValue(rawValue);
      continue;
    }

    value[key] = parseIndentedValue(state, indent + 2);
  }

  return value;
}

function parseYamlArrayBlock(state: YamlState, indent: number): any[] {
  const value: any[] = [];

  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (line.trim() === '') {
      state.index++;
      continue;
    }

    const lineIndent = getIndent(line);
    if (lineIndent < indent) break;
    if (lineIndent !== indent) break;

    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) break;

    const itemRaw = trimmed.slice(2).trim();
    state.index++;

    if (itemRaw === '') {
      value.push(parseIndentedValue(state, indent + 2));
      continue;
    }

    const keyValueMatch = itemRaw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyValueMatch) {
      value.push(parseYamlValue(itemRaw));
      continue;
    }

    const item: Record<string, any> = {};
    const [, key, rawValue] = keyValueMatch;

    if (rawValue === '>') {
      item[key] = parseFoldedBlock(state, indent + 2);
    } else if (rawValue !== '') {
      item[key] = parseYamlValue(rawValue);
    } else {
      item[key] = parseIndentedValue(state, indent + 2);
    }

    while (state.index < state.lines.length) {
      const nestedLine = state.lines[state.index];
      if (nestedLine.trim() === '') {
        state.index++;
        continue;
      }

      const nestedIndent = getIndent(nestedLine);
      if (nestedIndent <= indent) break;

      const nestedTrimmed = nestedLine.trim();
      const nestedMatch = nestedTrimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!nestedMatch) {
        state.index++;
        continue;
      }

      const [, nestedKey, nestedRawValue] = nestedMatch;
      state.index++;

      if (nestedRawValue === '>') {
        item[nestedKey] = parseFoldedBlock(state, nestedIndent + 2);
      } else if (nestedRawValue !== '') {
        item[nestedKey] = parseYamlValue(nestedRawValue);
      } else {
        item[nestedKey] = parseIndentedValue(state, nestedIndent + 2);
      }
    }

    value.push(item);
  }

  return value;
}

function parseIndentedValue(state: YamlState, indent: number): any {
  while (state.index < state.lines.length && state.lines[state.index].trim() === '') {
    state.index++;
  }

  if (state.index >= state.lines.length) {
    return '';
  }

  const nextLine = state.lines[state.index];
  const nextIndent = getIndent(nextLine);
  if (nextIndent < indent) {
    return '';
  }

  const actualIndent = Math.max(indent, nextIndent);
  const trimmed = nextLine.trim();
  if (trimmed.startsWith('- ')) {
    return parseYamlArrayBlock(state, actualIndent);
  }

  return parseYamlObjectBlock(state, actualIndent);
}

function parseFoldedBlock(state: YamlState, indent: number): string {
  const foldedLines: string[] = [];

  while (state.index < state.lines.length) {
    const line = state.lines[state.index];

    if (line.trim() === '') {
      foldedLines.push('');
      state.index++;
      continue;
    }

    const lineIndent = getIndent(line);
    if (lineIndent < indent) break;

    foldedLines.push(line.slice(indent));
    state.index++;
  }

  return foldedLines.join('\n').trim();
}

function parseYamlValue(raw: string): any {
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return parseFloat(raw);
  }

  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;

  return raw;
}

function getIndent(line: string): number {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function countChars(lines: string[], startIdx: number, endIdx: number): number {
  let count = 0;
  for (let i = startIdx; i <= Math.min(endIdx, lines.length - 1); i++) {
    count += (lines[i]?.length ?? 0) + 1;
  }
  return count;
}
