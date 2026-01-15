import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

/**
 * 术语条目
 */
export interface GlossaryEntry {
  source: string; // 源词
  target: string; // 目标词
  note?: string; // 备注
}

/**
 * 术语表分类
 */
export interface GlossaryCategory {
  id: string;
  name: string; // 分类名称
  description?: string; // 分类描述
  createdAt: number;
  updatedAt: number;
}

/**
 * 术语表
 */
export interface GlossaryItem {
  id: string;
  categoryId: string; // 所属分类
  name: string; // 术语表名称
  description?: string; // 描述
  entries: GlossaryEntry[]; // 术语条目
  sourceFile?: string; // 来源文件名（如果是导入的）
  sourceFormat?: string; // 来源格式
  createdAt: number;
  updatedAt: number;
}

/**
 * 存储结构
 */
interface StoreShape {
  categories: GlossaryCategory[];
  glossaries: GlossaryItem[];
}

/**
 * 解析结果
 */
export interface ParseResult {
  success: boolean;
  entries: GlossaryEntry[];
  format: 'json-object' | 'json-array' | 'csv' | 'tsv' | 'text' | 'unknown';
  error?: string;
  suggestedName?: string;
}

const FILE = path.join(app.getPath('userData'), 'data', 'ai-glossaries.json');

// 默认分类
const DEFAULT_CATEGORIES: GlossaryCategory[] = [
  { id: 'general', name: '通用术语', description: '通用翻译术语', createdAt: 0, updatedAt: 0 },
  { id: 'technical', name: '技术术语', description: '编程、软件相关术语', createdAt: 0, updatedAt: 0 },
  { id: 'names', name: '人名地名', description: '人名、地名、机构名等专有名词', createdAt: 0, updatedAt: 0 }
];

function read(): StoreShape {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw);
    return {
      categories: Array.isArray(data?.categories) ? data.categories : [...DEFAULT_CATEGORIES],
      glossaries: Array.isArray(data?.glossaries) ? data.glossaries : []
    };
  } catch {
    return { categories: [...DEFAULT_CATEGORIES], glossaries: [] };
  }
}

function write(data: StoreShape): void {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[glossary-store] Failed to write:', e);
  }
}

/**
 * 解析 JSON 对象格式: { "source": "target", ... }
 */
function parseJsonObject(obj: Record<string, any>): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  for (const [source, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      entries.push({ source, target: value });
    } else if (typeof value === 'object' && value !== null) {
      entries.push({
        source,
        target: value.target || value.translation || String(value),
        note: value.note || value.comment || value.description
      });
    }
  }
  return entries;
}

/**
 * 解析 JSON 数组格式: [{ source, target, note? }, ...]
 */
function parseJsonArray(arr: any[]): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  for (const item of arr) {
    if (typeof item === 'object' && item !== null) {
      const source = item.source || item.src || item.from || item.original || item.en;
      const target = item.target || item.tgt || item.to || item.translation || item.zh;
      if (source && target) {
        entries.push({
          source: String(source),
          target: String(target),
          note: item.note || item.comment || item.description
        });
      }
    }
  }
  return entries;
}

/**
 * 解析 CSV/TSV 格式
 */
function parseCsvTsv(content: string, delimiter: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  for (const line of lines) {
    const parts = line.split(delimiter).map((p) => p.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      entries.push({
        source: parts[0],
        target: parts[1],
        note: parts[2] || undefined
      });
    }
  }
  return entries;
}

/**
 * 解析纯文本格式（支持多种分隔符）
 * 支持: source = target, source -> target, source : target, source | target
 */
function parseText(content: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  // 常见分隔符模式
  const patterns = [
    /^(.+?)\s*=\s*(.+?)(?:\s*[#\/\/](.*))?$/, // source = target # note
    /^(.+?)\s*->\s*(.+?)(?:\s*[#\/\/](.*))?$/, // source -> target
    /^(.+?)\s*:\s*(.+?)(?:\s*[#\/\/](.*))?$/, // source : target
    /^(.+?)\s*\|\s*(.+?)(?:\s*[#\/\/](.*))?$/, // source | target
    /^(.+?)\s*→\s*(.+?)(?:\s*[#\/\/](.*))?$/, // source → target (Unicode arrow)
    /^(.+?)\s{2,}(.+?)(?:\s*[#\/\/](.*))?$/ // source    target (multiple spaces)
  ];

  for (const line of lines) {
    // 跳过注释行
    if (line.startsWith('#') || line.startsWith('//')) continue;

    let matched = false;
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1] && match[2]) {
        entries.push({
          source: match[1].trim(),
          target: match[2].trim(),
          note: match[3]?.trim() || undefined
        });
        matched = true;
        break;
      }
    }

    // 如果没有匹配到任何分隔符，尝试用逗号或 Tab 分割
    if (!matched) {
      const tabParts = line.split('\t');
      if (tabParts.length >= 2) {
        entries.push({
          source: tabParts[0].trim(),
          target: tabParts[1].trim(),
          note: tabParts[2]?.trim() || undefined
        });
      } else {
        const commaParts = line.split(',');
        if (commaParts.length >= 2) {
          entries.push({
            source: commaParts[0].trim(),
            target: commaParts[1].trim(),
            note: commaParts[2]?.trim() || undefined
          });
        }
      }
    }
  }
  return entries;
}

export const GlossaryStore = {
  // ==================== 分类管理 ====================

  /**
   * 列出所有分类
   */
  listCategories(): GlossaryCategory[] {
    return read().categories;
  },

  /**
   * 获取单个分类
   */
  getCategory(id: string): GlossaryCategory | undefined {
    return read().categories.find((c) => c.id === id);
  },

  /**
   * 创建分类
   */
  createCategory(payload: { name: string; description?: string }): GlossaryCategory {
    const d = read();
    const now = Date.now();
    const item: GlossaryCategory = {
      id: randomUUID(),
      name: payload.name,
      description: payload.description,
      createdAt: now,
      updatedAt: now
    };
    d.categories.push(item);
    write(d);
    return item;
  },

  /**
   * 更新分类
   */
  updateCategory(id: string, patch: Partial<Pick<GlossaryCategory, 'name' | 'description'>>): GlossaryCategory | undefined {
    const d = read();
    const idx = d.categories.findIndex((c) => c.id === id);
    if (idx < 0) return undefined;
    const next = { ...d.categories[idx], ...patch, updatedAt: Date.now() };
    d.categories[idx] = next;
    write(d);
    return next;
  },

  /**
   * 删除分类（同时删除该分类下的所有术语表）
   */
  deleteCategory(id: string): boolean {
    // 不允许删除默认分类
    if (['general', 'technical', 'names'].includes(id)) {
      return false;
    }
    const d = read();
    const before = d.categories.length;
    d.categories = d.categories.filter((c) => c.id !== id);
    // 同时删除该分类下的术语表
    d.glossaries = d.glossaries.filter((g) => g.categoryId !== id);
    write(d);
    return d.categories.length !== before;
  },

  // ==================== 术语表管理 ====================

  /**
   * 列出术语表
   * @param categoryId 可选，按分类筛选
   */
  listGlossaries(categoryId?: string): GlossaryItem[] {
    const d = read();
    if (categoryId) {
      return d.glossaries.filter((g) => g.categoryId === categoryId);
    }
    return d.glossaries;
  },

  /**
   * 获取单个术语表
   */
  getGlossary(id: string): GlossaryItem | undefined {
    return read().glossaries.find((g) => g.id === id);
  },

  /**
   * 创建术语表
   */
  createGlossary(payload: { categoryId: string; name: string; description?: string; entries: GlossaryEntry[]; sourceFile?: string; sourceFormat?: string }): GlossaryItem {
    const d = read();
    const now = Date.now();
    const item: GlossaryItem = {
      id: randomUUID(),
      categoryId: payload.categoryId,
      name: payload.name,
      description: payload.description,
      entries: payload.entries,
      sourceFile: payload.sourceFile,
      sourceFormat: payload.sourceFormat,
      createdAt: now,
      updatedAt: now
    };
    d.glossaries.push(item);
    write(d);
    return item;
  },

  /**
   * 更新术语表
   */
  updateGlossary(id: string, patch: Partial<Pick<GlossaryItem, 'categoryId' | 'name' | 'description' | 'entries'>>): GlossaryItem | undefined {
    const d = read();
    const idx = d.glossaries.findIndex((g) => g.id === id);
    if (idx < 0) return undefined;
    const next = { ...d.glossaries[idx], ...patch, updatedAt: Date.now() };
    d.glossaries[idx] = next;
    write(d);
    return next;
  },

  /**
   * 删除术语表
   */
  deleteGlossary(id: string): boolean {
    const d = read();
    const before = d.glossaries.length;
    d.glossaries = d.glossaries.filter((g) => g.id !== id);
    write(d);
    return d.glossaries.length !== before;
  },

  /**
   * 向术语表添加条目
   */
  addEntries(glossaryId: string, entries: GlossaryEntry[]): GlossaryItem | undefined {
    const d = read();
    const idx = d.glossaries.findIndex((g) => g.id === glossaryId);
    if (idx < 0) return undefined;
    const glossary = d.glossaries[idx];
    // 去重：按 source 去重
    const existingSources = new Set(glossary.entries.map((e) => e.source.toLowerCase()));
    const newEntries = entries.filter((e) => !existingSources.has(e.source.toLowerCase()));
    glossary.entries = [...glossary.entries, ...newEntries];
    glossary.updatedAt = Date.now();
    d.glossaries[idx] = glossary;
    write(d);
    return glossary;
  },

  /**
   * 从术语表删除条目
   */
  removeEntry(glossaryId: string, source: string): GlossaryItem | undefined {
    const d = read();
    const idx = d.glossaries.findIndex((g) => g.id === glossaryId);
    if (idx < 0) return undefined;
    const glossary = d.glossaries[idx];
    glossary.entries = glossary.entries.filter((e) => e.source !== source);
    glossary.updatedAt = Date.now();
    d.glossaries[idx] = glossary;
    write(d);
    return glossary;
  },

  // ==================== 导入解析 ====================

  /**
   * 解析导入内容，自动识别格式
   */
  parseContent(content: string, fileName?: string): ParseResult {
    const trimmed = content.trim();

    // 尝试从文件名推断格式和名称
    const suggestedName = fileName ? path.basename(fileName, path.extname(fileName)) : undefined;

    // 1. 尝试解析为 JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const entries = parseJsonArray(parsed);
          if (entries.length > 0) {
            return { success: true, entries, format: 'json-array', suggestedName };
          }
        } else if (typeof parsed === 'object') {
          const entries = parseJsonObject(parsed);
          if (entries.length > 0) {
            return { success: true, entries, format: 'json-object', suggestedName };
          }
        }
      } catch {
        // JSON 解析失败，继续尝试其他格式
      }
    }

    // 2. 检测文件扩展名
    const ext = fileName ? path.extname(fileName).toLowerCase() : '';
    if (ext === '.csv') {
      const entries = parseCsvTsv(trimmed, ',');
      if (entries.length > 0) {
        return { success: true, entries, format: 'csv', suggestedName };
      }
    }
    if (ext === '.tsv') {
      const entries = parseCsvTsv(trimmed, '\t');
      if (entries.length > 0) {
        return { success: true, entries, format: 'tsv', suggestedName };
      }
    }

    // 3. 自动检测分隔符
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('//'));
    if (lines.length > 0) {
      // 检测是否为 Tab 分隔
      const tabCount = lines.filter((l) => l.includes('\t')).length;
      if (tabCount > lines.length * 0.5) {
        const entries = parseCsvTsv(trimmed, '\t');
        if (entries.length > 0) {
          return { success: true, entries, format: 'tsv', suggestedName };
        }
      }

      // 检测是否为纯逗号分隔（排除带空格的情况）
      const pureCommaCount = lines.filter((l) => l.includes(',') && !l.match(/[=\->:|→]/)).length;
      if (pureCommaCount > lines.length * 0.5) {
        const entries = parseCsvTsv(trimmed, ',');
        if (entries.length > 0) {
          return { success: true, entries, format: 'csv', suggestedName };
        }
      }
    }

    // 4. 尝试纯文本格式（最宽松）
    const textEntries = parseText(trimmed);
    if (textEntries.length > 0) {
      return { success: true, entries: textEntries, format: 'text', suggestedName };
    }

    return {
      success: false,
      entries: [],
      format: 'unknown',
      error: '无法识别内容格式，请检查格式是否正确'
    };
  },

  /**
   * 合并多个术语表的条目（用于翻译时）
   */
  mergeGlossaries(ids: string[]): GlossaryEntry[] {
    const d = read();
    const allEntries: GlossaryEntry[] = [];
    const seen = new Set<string>();

    for (const id of ids) {
      const glossary = d.glossaries.find((g) => g.id === id);
      if (glossary) {
        for (const entry of glossary.entries) {
          const key = entry.source.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            allEntries.push(entry);
          }
        }
      }
    }

    return allEntries;
  }
};
