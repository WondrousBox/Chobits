export interface TopicCanonicalizationCandidate {
  id: string;
  label: string;
  slug: string;
  aliases?: string | null;
  domain?: string | null;
  heat?: number | null;
}

export interface TopicCanonicalizationDb {
  findTopicBySlug: (slug: string, workspaceId?: string) => Promise<TopicCanonicalizationCandidate | undefined>;
  searchTopics: (term: string, workspaceId?: string, limit?: number) => Promise<TopicCanonicalizationCandidate[]>;
  findTopicsByDomain?: (domain: string, workspaceId?: string, limit?: number) => Promise<TopicCanonicalizationCandidate[]>;
}

export interface TopicCanonicalizationInput {
  topicLabel: string;
  topicSlug?: string;
  workspaceId?: string;
  domain?: string;
}

export interface TopicCanonicalizationResult {
  label: string;
  slug: string;
  aliases: string[];
  matchedExisting: boolean;
  matchedTopicId?: string;
  confidence: number;
}

const GENERIC_TOPIC_SUFFIXES = [
  '推荐',
  '总结',
  '整理',
  '分享',
  '攻略',
  '指南',
  '清单',
  '笔记',
  '记录',
  '经验',
  '汇总',
  '入门',
  '基础',
  '速览',
  'overview',
  'guide',
  'guides',
  'tips',
  'summary',
  'summaries',
  'notes',
  'note',
  'recommendation',
  'recommendations'
];

export function sanitizeTopicLabel(label: string): string {
  return label
    .replace(/[「」『』【】（）()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyTopicLabel(label: string): string {
  return sanitizeTopicLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function compactTopicLabel(label: string): string {
  let current = sanitizeTopicLabel(label);
  if (!current) return '';

  current = current.replace(/^(关于|有关)\s*/u, '').trim();

  let changed = true;
  while (changed && current.length > 2) {
    changed = false;
    for (const suffix of GENERIC_TOPIC_SUFFIXES) {
      const pattern = new RegExp(`(?:\\s+)?${escapeRegExp(suffix)}$`, 'iu');
      if (!pattern.test(current)) continue;
      const next = current.replace(pattern, '').trim();
      if (next.length >= 2) {
        current = next;
        changed = true;
        break;
      }
    }
  }

  return current || sanitizeTopicLabel(label);
}

export async function canonicalizeTopicLabel(input: TopicCanonicalizationInput, db?: TopicCanonicalizationDb): Promise<TopicCanonicalizationResult> {
  const rawLabel = sanitizeTopicLabel(input.topicLabel);
  const rawSlug = input.topicSlug?.trim() || slugifyTopicLabel(rawLabel);
  const compactLabel = compactTopicLabel(rawLabel) || rawLabel;
  const compactSlug = slugifyTopicLabel(compactLabel) || rawSlug;

  if (!db) {
    return {
      label: compactLabel,
      slug: compactSlug,
      aliases: dedupStrings(compactLabel !== rawLabel ? [rawLabel] : []),
      matchedExisting: false,
      confidence: compactLabel === rawLabel ? 0.75 : 0.9
    };
  }

  const candidateMap = new Map<string, TopicCanonicalizationCandidate>();
  const terms = dedupStrings([rawLabel, compactLabel, rawSlug, compactSlug]);

  const exactSlugCandidates = await Promise.all(
    dedupStrings([compactSlug, rawSlug])
      .filter(Boolean)
      .map((slug) => db.findTopicBySlug(slug, input.workspaceId))
  );

  for (const candidate of exactSlugCandidates) {
    if (candidate?.id) candidateMap.set(candidate.id, candidate);
  }

  const searchBatches = await Promise.all(terms.map((term) => db.searchTopics(term, input.workspaceId, 5)));
  for (const batch of searchBatches) {
    for (const candidate of batch) {
      if (candidate?.id) candidateMap.set(candidate.id, candidate);
    }
  }

  if (db.findTopicsByDomain && input.domain && input.domain !== 'general') {
    const domainCandidates = await db.findTopicsByDomain(input.domain, input.workspaceId, 20);
    for (const candidate of domainCandidates) {
      if (candidate?.id) candidateMap.set(candidate.id, candidate);
    }
  }

  let best: TopicCanonicalizationCandidate | undefined;
  let bestScore = 0;
  for (const candidate of candidateMap.values()) {
    const score = scoreTopicCandidate(candidate, {
      rawLabel,
      rawSlug,
      compactLabel,
      compactSlug,
      domain: input.domain
    });
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (best && bestScore >= 0.93) {
    const aliases = dedupStrings([compactLabel, rawLabel]).filter((alias) => alias !== best.label);
    return {
      label: best.label,
      slug: best.slug,
      aliases,
      matchedExisting: true,
      matchedTopicId: best.id,
      confidence: bestScore
    };
  }

  return {
    label: compactLabel,
    slug: compactSlug,
    aliases: dedupStrings(compactLabel !== rawLabel ? [rawLabel] : []),
    matchedExisting: false,
    confidence: compactLabel === rawLabel ? 0.78 : 0.9
  };
}

function scoreTopicCandidate(
  candidate: TopicCanonicalizationCandidate,
  input: {
    rawLabel: string;
    rawSlug: string;
    compactLabel: string;
    compactSlug: string;
    domain?: string;
  }
): number {
  const candidateLabelKey = normalizeTopicKey(candidate.label);
  const rawKey = normalizeTopicKey(input.rawLabel);
  const compactKey = normalizeTopicKey(input.compactLabel);
  const aliasKeys = parseAliases(candidate.aliases).map(normalizeTopicKey).filter(Boolean);

  let score = 0;
  if (candidate.slug === input.compactSlug) score = Math.max(score, 1.0);
  if (candidate.slug === input.rawSlug) score = Math.max(score, 0.98);
  if (candidateLabelKey === compactKey) score = Math.max(score, 0.99);
  if (candidateLabelKey === rawKey) score = Math.max(score, 0.97);
  if (aliasKeys.includes(compactKey)) score = Math.max(score, 0.96);
  if (aliasKeys.includes(rawKey)) score = Math.max(score, 0.94);

  if (compactKey.length >= 2) {
    if (candidateLabelKey.includes(compactKey) || compactKey.includes(candidateLabelKey)) {
      score = Math.max(score, 0.88);
    }
    if (aliasKeys.some((aliasKey) => aliasKey.includes(compactKey) || compactKey.includes(aliasKey))) {
      score = Math.max(score, 0.86);
    }
  }

  if (score <= 0) return 0;

  if (input.domain && input.domain !== 'general') {
    if (candidate.domain === input.domain) score += 0.03;
    else if (candidate.domain && candidate.domain !== 'general') score -= 0.08;
  }

  score += Math.min(Math.max(candidate.heat ?? 0, 0), 1) * 0.02;
  return Math.max(0, Math.min(score, 1));
}

function normalizeTopicKey(value: string): string {
  return sanitizeTopicLabel(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function parseAliases(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function dedupStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((item) => sanitizeTopicLabel(item)).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
