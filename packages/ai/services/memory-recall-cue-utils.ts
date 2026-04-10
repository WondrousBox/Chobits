export type RecallCueKind = 'ongoing' | 'decision' | 'principle' | 'event' | 'follow_up';

const RECALL_CUE_KIND_ALIASES: Record<string, RecallCueKind> = {
  decision: 'decision',
  event: 'event',
  follow_up: 'follow_up',
  'follow-up': 'follow_up',
  'follow up': 'follow_up',
  followup: 'follow_up',
  ongoing: 'ongoing',
  principle: 'principle'
};

export function mergeUniqueBulletSection(primary: string, secondary: string, maxItems: number): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const content of [primary, secondary]) {
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith('- ')) {
        continue;
      }
      const key = line.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      lines.push(line);
      if (lines.length >= maxItems) {
        return lines.join('\n');
      }
    }
  }

  return lines.join('\n');
}

export function normalizeRecallCueSection(value: string | undefined, maxItems = 8): string | undefined {
  if (!value) {
    return undefined;
  }

  const mergedBullets = mergeUniqueBulletSection(value, '', maxItems);
  if (!mergedBullets) {
    return undefined;
  }

  const sanitized = mergedBullets
    .split('\n')
    .map((line) => {
      const bullet = line.replace(/^- /, '').trim();
      if (!bullet) {
        return '';
      }

      const match = bullet.match(/^\[([^\]]+)\]\s*(.+)$/);
      if (!match) {
        return `- [event] ${bullet}`;
      }

      const rawKind = match[1].trim().toLowerCase();
      const normalizedKind = RECALL_CUE_KIND_ALIASES[rawKind] ?? 'event';
      const statement = match[2].trim();
      return statement ? `- [${normalizedKind}] ${statement}` : '';
    })
    .filter(Boolean)
    .join('\n');

  return sanitized || undefined;
}
