/**
 * Memory Note Writer
 * Render merged notes to Markdown with YAML frontmatter.
 */

import type { MemoryNoteFrontmatter, MergedNote } from './memory-types';

/**
 * Render a full Memory Note Markdown document.
 */
export function renderNoteMarkdown(note: MergedNote): string {
  const parts: string[] = [];

  parts.push('---');
  parts.push(renderFrontmatter(note.frontmatter));
  parts.push('---');
  parts.push('');

  const sectionOrder = ['Key Points', 'Contradictions', 'Open Items', 'Recall Cues', 'Source Excerpts'];

  for (const heading of sectionOrder) {
    const content = note.sections.get(heading);
    if (content && content.trim()) {
      parts.push(`## ${heading}`);
      parts.push('');
      parts.push(content.trim());
      parts.push('');
    }
  }

  for (const [heading, content] of note.sections) {
    if (!sectionOrder.includes(heading) && content && content.trim()) {
      parts.push(`## ${heading}`);
      parts.push('');
      parts.push(content.trim());
      parts.push('');
    }
  }

  return parts.join('\n');
}

/**
 * Render YAML frontmatter without `---` delimiters.
 */
function renderFrontmatter(fm: MemoryNoteFrontmatter): string {
  const lines: string[] = [];

  lines.push(`id: '${fm.id}'`);
  lines.push(`version: ${fm.version}`);

  lines.push(`workspaceId: '${escapeYaml(fm.workspaceId)}'`);
  lines.push(`date: '${escapeYaml(fm.date)}'`);
  if (fm.timeRange) {
    lines.push('timeRange:');
    lines.push(`  start: ${fm.timeRange.start}`);
    lines.push(`  end: ${fm.timeRange.end}`);
  }

  lines.push('topics:');
  for (const topic of fm.topics) {
    lines.push(`  - '${escapeYaml(topic)}'`);
  }
  if (fm.parentTopicId) {
    lines.push(`parentTopicId: '${escapeYaml(fm.parentTopicId)}'`);
  }
  if (fm.relatedTopicIds?.length) {
    lines.push('relatedTopicIds:');
    for (const relatedTopicId of fm.relatedTopicIds) {
      lines.push(`  - '${escapeYaml(relatedTopicId)}'`);
    }
  }
  if (fm.domain) {
    lines.push(`domain: '${escapeYaml(fm.domain)}'`);
  }

  lines.push('keywords:');
  for (const keyword of fm.keywords) {
    lines.push(`  - '${escapeYaml(keyword)}'`);
  }
  if (fm.aliases?.length) {
    lines.push('aliases:');
    for (const alias of fm.aliases) {
      lines.push(`  - '${escapeYaml(alias)}'`);
    }
  }
  if (fm.entities?.length) {
    lines.push('entities:');
    for (const entity of fm.entities) {
      lines.push(`  - name: '${escapeYaml(entity.name)}'`);
      lines.push(`    type: '${escapeYaml(entity.type)}'`);
      if (entity.relations?.length) {
        lines.push('    relations:');
        for (const relation of entity.relations) {
          lines.push(`      - predicate: '${escapeYaml(relation.predicate)}'`);
          lines.push(`        object: '${escapeYaml(relation.object)}'`);
          if (relation.validFrom) {
            lines.push(`        validFrom: '${escapeYaml(relation.validFrom)}'`);
          }
        }
      }
    }
  }

  lines.push('summary: >');
  lines.push(`  ${fm.summary.replace(/\n/g, '\n  ')}`);
  if (fm.contradictions?.length) {
    lines.push('contradictions:');
    for (const contradiction of fm.contradictions) {
      lines.push(`  - old: '${escapeYaml(contradiction.old)}'`);
      lines.push(`    new: '${escapeYaml(contradiction.new)}'`);
      lines.push(`    type: '${escapeYaml(contradiction.type)}'`);
      lines.push(`    detectedAt: ${contradiction.detectedAt}`);
    }
  }

  lines.push('sourceConversationIds:');
  for (const conversationId of fm.sourceConversationIds) {
    lines.push(`  - '${escapeYaml(conversationId)}'`);
  }
  if (fm.sourceMessageRange?.length) {
    lines.push('sourceMessageRange:');
    for (const range of fm.sourceMessageRange) {
      lines.push(`  - conversationId: '${escapeYaml(range.conversationId)}'`);
      lines.push(`    seqStart: ${range.seqStart}`);
      lines.push(`    seqEnd: ${range.seqEnd}`);
    }
  }

  lines.push(`importance: ${fm.importance}`);
  lines.push(`stability: ${fm.stability}`);

  lines.push(`createdAt: ${fm.createdAt}`);
  lines.push(`updatedAt: ${fm.updatedAt}`);

  return lines.join('\n');
}

/**
 * Build the default note sections map from extraction output.
 */
export function buildSectionsMap(sections: { keyPoints: string; openItems?: string; recallCues?: string }): Map<string, string> {
  const map = new Map<string, string>();

  if (sections.keyPoints) {
    map.set('Key Points', sections.keyPoints);
  }
  if (sections.openItems) {
    map.set('Open Items', sections.openItems);
  }
  if ('recallCues' in sections && sections.recallCues) {
    map.set('Recall Cues', sections.recallCues);
  }

  return map;
}

/**
 * Build a workspace-relative memory note path.
 * Format: memory/daily/YYYY/MM/YYYY-MM-DD-topic-slug.md
 */
export function buildNotePath(date: string, topicSlug: string, suffix?: number): string {
  const [year, month] = date.split('-');
  const fileName = suffix ? `${date}-${topicSlug}-${suffix}.md` : `${date}-${topicSlug}.md`;
  return `memory/daily/${year}/${month}/${fileName}`;
}

/**
 * Generate a new Memory Note id.
 * Format: mem_{date}_{slug}_{short-hash}
 */
export function generateNoteId(date: string, topicSlug: string): string {
  const shortHash = Math.random().toString(16).slice(2, 8);
  return `mem_${date}_${topicSlug}_${shortHash}`;
}

export function buildSectionId(noteId: string, heading: string): string {
  return `${noteId}_sec_${heading.replace(/\s+/g, '_').toLowerCase()}`;
}

function escapeYaml(s: string): string {
  return s.replace(/'/g, "''");
}
