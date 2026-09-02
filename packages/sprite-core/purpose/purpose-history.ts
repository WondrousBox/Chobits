import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { buildSpritePurposeDailyRetrospective } from './purpose-retrospective';
import type {
  SpritePurposeDailyRetrospective,
  SpritePurposeHistoryEntry,
  SpritePurposeHistoryQuery,
  SpritePurposeHistoryReader,
  SpritePurposeHistoryWriter,
  SpritePurposeRetrospectiveQuery
} from './types';

const HISTORY_FILE_PREFIX = 'sprite-purpose-history-';
const HISTORY_FILE_SUFFIX = '.jsonl';

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isHistoryFile(fileName: string): boolean {
  return fileName.startsWith(HISTORY_FILE_PREFIX) && fileName.endsWith(HISTORY_FILE_SUFFIX);
}

function parseEntry(line: string): SpritePurposeHistoryEntry | null {
  try {
    const parsed = JSON.parse(line) as Partial<SpritePurposeHistoryEntry>;
    if (typeof parsed.timestamp !== 'number' || typeof parsed.eventType !== 'string' || typeof parsed.purposeId !== 'string') {
      return null;
    }
    return parsed as SpritePurposeHistoryEntry;
  } catch {
    return null;
  }
}

export class SpritePurposeHistoryStore implements SpritePurposeHistoryWriter, SpritePurposeHistoryReader {
  private readonly historyDir: string;

  constructor(dataDir: string) {
    this.historyDir = path.join(dataDir, 'data');
  }

  async append(entry: SpritePurposeHistoryEntry): Promise<void> {
    const filePath = this.resolveFilePath(entry.timestamp);
    try {
      if (!fs.existsSync(this.historyDir)) {
        fs.mkdirSync(this.historyDir, { recursive: true });
      }
      await fsp.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf-8');
    } catch (error) {
      console.warn('[SpritePurposeHistoryStore] Failed to append purpose history:', error);
    }
  }

  async list(query?: SpritePurposeHistoryQuery): Promise<SpritePurposeHistoryEntry[]> {
    const limit = Math.max(1, query?.limit ?? 100);
    const entries: SpritePurposeHistoryEntry[] = [];

    let fileNames: string[];
    try {
      fileNames = (await fsp.readdir(this.historyDir)).filter(isHistoryFile).sort().reverse();
    } catch {
      return [];
    }

    for (const fileName of fileNames) {
      const filePath = path.join(this.historyDir, fileName);
      const content = await fsp.readFile(filePath, 'utf-8').catch(() => '');
      if (!content) continue;

      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const entry = parseEntry(trimmed);
        if (!entry || !this.matchesQuery(entry, query)) continue;
        entries.push(entry);
      }

      if (entries.length >= limit) {
        break;
      }
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  async getDailyRetrospective(query: SpritePurposeRetrospectiveQuery = {}): Promise<SpritePurposeDailyRetrospective> {
    const date = query.date ?? formatDate(Date.now());
    const entries = await this.list({
      date,
      limit: 5000,
      status: 'all'
    });
    return buildSpritePurposeDailyRetrospective(
      entries.sort((a, b) => a.timestamp - b.timestamp),
      {
        ...query,
        date
      }
    );
  }

  private resolveFilePath(timestamp: number): string {
    return path.join(this.historyDir, `${HISTORY_FILE_PREFIX}${formatDate(timestamp)}${HISTORY_FILE_SUFFIX}`);
  }

  private matchesQuery(entry: SpritePurposeHistoryEntry, query?: SpritePurposeHistoryQuery): boolean {
    const eventTypes = Array.isArray(query?.eventType) ? query.eventType : query?.eventType ? [query.eventType] : [];
    if (eventTypes.length > 0 && !eventTypes.includes(entry.eventType)) {
      return false;
    }

    if (query?.kind && entry.purposeKind !== query.kind) {
      return false;
    }

    if (query?.date && formatDate(entry.timestamp) !== query.date) {
      return false;
    }

    if (typeof query?.since === 'number' && entry.timestamp < query.since) {
      return false;
    }

    if (typeof query?.until === 'number' && entry.timestamp > query.until) {
      return false;
    }

    if (query?.status && query.status !== 'all' && entry.status !== query.status) {
      return false;
    }

    return true;
  }
}
