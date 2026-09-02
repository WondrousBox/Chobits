import path from 'node:path';

import { getPiToolDescriptor } from '../tool-registry';
import type { SkillRecord, SkillSearchResult } from './types';

/** Bidirectional synonym table for cross-language matching */
const SYNONYM_TABLE: Record<string, string[]> = {
  download: ['下载'],
  find: ['查找', '查询'],
  search: ['查找', '查询', '搜索'],
  下载: ['download'],
  查找: ['search', 'find', 'query', '查询', '搜索'],
  查询: ['search', 'find', 'query', '查找', '搜索'],
  搜索: ['search', 'find', '查找', '查询']
};

export interface MatchSkillOptions {
  limit?: number;
  query: string;
  workspaceRoot?: string;
}

export function searchSkills(records: SkillRecord[], options: MatchSkillOptions): SkillSearchResult[] {
  const query = options.query.trim();
  if (!query) return [];

  const queryLower = query.toLowerCase();
  const tokens = tokenizeQuery(query);
  const expandedTokens = expandWithSynonyms(tokens);
  const originalSet = new Set(tokens);

  return records
    .map((record) => {
      let score = 0;
      const matchedFields = new Set<string>();

      score += scoreExact(queryLower, record.name, 'name', matchedFields, 18, 10);

      for (const alias of record.aliases) {
        score += scoreExact(queryLower, alias, 'aliases', matchedFields, 14, 8);
      }

      score += scorePartialText(queryLower, record.description, 'description', matchedFields, 6, 3);
      score += scorePartialText(queryLower, record.whenToUse, 'when_to_use', matchedFields, 5, 2);

      for (const tag of record.tags) {
        score += scoreExact(queryLower, tag, 'tags', matchedFields, 8, 3);
      }

      for (const token of expandedTokens) {
        const weight = originalSet.has(token) ? 1 : 0.6;
        score += scoreTokenAgainstRecord(record, token, weight, matchedFields);
      }

      const pathsMatched = isSkillPathMatched(record, options.workspaceRoot);
      if (record.paths?.length) {
        if (pathsMatched) {
          score += 2;
          matchedFields.add('paths');
        } else {
          score -= 4;
        }
      }

      return {
        matchedFields: Array.from(matchedFields),
        pathsMatched,
        record,
        score
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.pathsMatched !== right.pathsMatched) return left.pathsMatched ? -1 : 1;
      return left.record.name.localeCompare(right.record.name);
    })
    .slice(0, options.limit ?? 10);
}

export function isSkillPathMatched(record: SkillRecord, workspaceRoot?: string): boolean {
  if (!record.paths?.length) return true;
  const normalizedWorkspaceRoot = normalizeForMatch(workspaceRoot);
  if (!normalizedWorkspaceRoot) return false;

  return record.paths.some((pattern) => {
    const normalizedPattern = normalizeForMatch(pattern);
    if (!normalizedPattern) return false;
    if (!normalizedPattern.includes('*')) {
      return normalizedWorkspaceRoot.includes(normalizedPattern);
    }

    const staticPrefix = normalizedPattern.split('*')[0].replace(/\/+$/, '');
    if (!staticPrefix) return true;
    return normalizedWorkspaceRoot.includes(staticPrefix);
  });
}

export function findSkillByReference(records: SkillRecord[], reference: string): SkillRecord | undefined {
  const normalizedReference = reference.trim().toLowerCase();
  if (!normalizedReference) return undefined;

  return records.find((record) => {
    if (record.name.trim().toLowerCase() === normalizedReference) return true;
    return record.aliases.some((alias) => alias.trim().toLowerCase() === normalizedReference);
  });
}

function scoreTokenAgainstRecord(record: SkillRecord, token: string, weight: number, matchedFields: Set<string>): number {
  let score = 0;

  score += scoreTokenInList(token, [record.name], 'name', matchedFields, weight, 8, 3);
  score += scoreTokenInList(token, record.aliases, 'aliases', matchedFields, weight, 6, 2);
  score += scoreTokenInList(token, record.tags, 'tags', matchedFields, weight, 5, 2);
  score += scoreTokenInList(token, [record.description], 'description', matchedFields, weight, 2, 1);
  score += scoreTokenInList(token, [record.whenToUse || ''], 'when_to_use', matchedFields, weight, 2, 1);

  const toolTexts = Array.from(
    new Set(
      [...record.allowedToolIds, ...record.activationToolIds]
        .map((toolId) => getPiToolDescriptor(toolId))
        .filter((tool): tool is NonNullable<ReturnType<typeof getPiToolDescriptor>> => Boolean(tool))
        .flatMap((tool) => [tool.name, tool.description])
    )
  );

  score += scoreTokenInList(token, toolTexts, 'tools', matchedFields, weight, 4, 2);

  return score;
}

function scoreTokenInList(token: string, values: string[], field: string, matchedFields: Set<string>, weight: number, exactWeight: number, partialWeight: number): number {
  let score = 0;

  for (const value of values) {
    const normalizedValue = value.toLowerCase();
    const valueTokens = tokenizeQuery(value);

    for (const candidate of valueTokens.length > 0 ? valueTokens : [normalizedValue]) {
      if (candidate === token) {
        score += exactWeight * weight;
        matchedFields.add(field);
      } else if (candidate.includes(token) || token.includes(candidate) || normalizedValue.includes(token)) {
        score += partialWeight * weight;
        matchedFields.add(field);
      }
    }
  }

  return score;
}

function scoreExact(queryLower: string, value: string, field: string, matchedFields: Set<string>, exactWeight: number, partialWeight: number): number {
  const normalizedValue = value.toLowerCase();
  if (queryLower === normalizedValue) {
    matchedFields.add(field);
    return exactWeight;
  }

  if (queryLower.includes(normalizedValue) || normalizedValue.includes(queryLower)) {
    matchedFields.add(field);
    return partialWeight;
  }

  return 0;
}

function scorePartialText(queryLower: string, value: string | undefined, field: string, matchedFields: Set<string>, exactWeight: number, partialWeight: number): number {
  if (!value) return 0;
  const normalizedValue = value.toLowerCase();
  if (normalizedValue.includes(queryLower)) {
    matchedFields.add(field);
    return normalizedValue === queryLower ? exactWeight : partialWeight;
  }
  return 0;
}

function normalizeForMatch(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  return path.normalize(value).replace(/\\/g, '/').toLowerCase();
}

function tokenizeQuery(text: string): string[] {
  const result: string[] = [];
  const parts = text.split(/[\s,，、;；:：]+/).filter(Boolean);
  for (const part of parts) {
    const segments = part.match(/[\u4e00-\u9fff\u3400-\u4dbf]+|[a-zA-Z0-9_-]+/g);
    if (!segments) continue;

    for (const segment of segments) {
      if (/[\u4e00-\u9fff]/.test(segment)) {
        result.push(...splitCJKByKnownTerms(segment));
      } else {
        result.push(segment.toLowerCase());
      }
    }
  }
  return result.filter(Boolean);
}

function splitCJKByKnownTerms(text: string): string[] {
  const knownTerms = Object.keys(SYNONYM_TABLE)
    .filter((item) => /[\u4e00-\u9fff]/.test(item))
    .sort((left, right) => right.length - left.length);

  const tokens: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let matched = false;
    for (const term of knownTerms) {
      if (!remaining.startsWith(term)) continue;
      tokens.push(term);
      remaining = remaining.slice(term.length);
      matched = true;
      break;
    }

    if (!matched) {
      if (remaining.length >= 2) {
        tokens.push(remaining.slice(0, 2));
        remaining = remaining.slice(1);
      } else {
        tokens.push(remaining);
        remaining = '';
      }
    }
  }

  return tokens;
}

function expandWithSynonyms(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const synonyms = SYNONYM_TABLE[token];
    if (!synonyms) continue;
    for (const synonym of synonyms) {
      expanded.add(synonym.toLowerCase());
    }
  }
  return Array.from(expanded);
}
