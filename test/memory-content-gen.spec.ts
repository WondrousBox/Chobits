import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { generateMemoryIndex, type ContentGenDbDeps } from '../packages/ai/services/memory-content-gen';

const tempDirs: string[] = [];

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-12T12:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function writeNote(workspaceRoot: string, relPath: string, content: string): Promise<void> {
  const absPath = path.join(workspaceRoot, relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, content, 'utf-8');
}

describe('memory content generation regression coverage', () => {
  it('prefers recall cues in MEMORY.md critical facts and writes INDEX.md browse output', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'chobits-memory-content-'));
    tempDirs.push(workspaceRoot);

    await writeNote(
      workspaceRoot,
      path.join('memory', 'daily', '2026', '04', '2026-04-12-runtime-memory.md'),
      [
        '## Key Points',
        '',
        '- Prefer runtime-configured thresholds over hardcoded defaults',
        '',
        '## Open Items',
        '',
        '- Add cleanup regression tests',
        '',
        '## Recall Cues',
        '',
        '- [decision] Keep extraction thresholds runtime-configured',
        '- [principle] Prefer runtime-configured thresholds over hardcoded defaults',
        '- [ongoing] Monitor extraction worker stability'
      ].join('\n')
    );

    await writeNote(
      workspaceRoot,
      path.join('memory', 'daily', '2026', '04', '2026-04-10-cleanup-memory.md'),
      [
        '## Key Points',
        '',
        '- Cleanup removes orphaned notes',
        '',
        '## Recall Cues',
        '',
        '- [event] Cleanup now removes orphaned note files too'
      ].join('\n')
    );

    const db: ContentGenDbDeps = {
      listNotesByDate: vi.fn(async () => []),
      listNotesByWorkspace: vi.fn(async () => [
        {
          id: 'note-runtime',
          date: '2026-04-12',
          filePath: 'memory/daily/2026/04/2026-04-12-runtime-memory.md',
          topics: JSON.stringify(['Runtime Memory']),
          summary: 'Memory extraction should follow runtime config.',
          importance: 0.92,
          stability: 0.9
        },
        {
          id: 'note-cleanup',
          date: '2026-04-10',
          filePath: 'memory/daily/2026/04/2026-04-10-cleanup-memory.md',
          topics: JSON.stringify(['Memory Cleanup']),
          summary: 'Cleanup now removes orphaned notes and files safely.',
          importance: 0.82,
          stability: 0.78
        }
      ]),
      listAllTopics: vi.fn(async () => [
        {
          id: 'topic_runtime_memory',
          label: 'Runtime Memory',
          slug: 'runtime-memory',
          heat: 0.95,
          noteCount: 1,
          description: 'Runtime behavior for extraction'
        },
        {
          id: 'topic_memory_cleanup',
          label: 'Memory Cleanup',
          slug: 'memory-cleanup',
          heat: 0.83,
          noteCount: 1,
          description: 'Cleanup and orphan removal'
        }
      ]),
      listNotesByTopicId: vi.fn(async () => [])
    };

    const result = await generateMemoryIndex(workspaceRoot, db, 'ws-1');
    const memoryMd = await readFile(path.join(workspaceRoot, result.filePath), 'utf-8');
    const indexMd = await readFile(path.join(workspaceRoot, result.indexFilePath), 'utf-8');

    expect(result).toMatchObject({
      filePath: 'memory/MEMORY.md',
      indexFilePath: 'memory/INDEX.md',
      noteCount: 2,
      topicCount: 2
    });
    expect(memoryMd).toContain('## Critical Facts');
    expect(memoryMd).toContain('[decision] Runtime Memory');
    expect(memoryMd).toContain('Keep extraction thresholds runtime-configured');
    expect(memoryMd).toContain('## User Preferences');
    expect(memoryMd).toContain('Prefer runtime-configured thresholds over hardcoded defaults');
    expect(memoryMd).toContain('## Active Projects');
    expect(memoryMd).toContain('Monitor extraction worker stability');
    expect(memoryMd).toContain('## 待跟进');
    expect(memoryMd).toContain('Add cleanup regression tests');

    expect(indexMd).toContain('# 记忆索引');
    expect(indexMd).toContain('## 热门主题');
    expect(indexMd).toContain('[Runtime Memory](topics/runtime-memory.md)');
    expect(indexMd).toContain('[2026-04-12-runtime-memory.md](daily/2026/04/2026-04-12-runtime-memory.md)');
  });

  it('falls back to stable summaries when recall cues are missing', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'chobits-memory-content-fallback-'));
    tempDirs.push(workspaceRoot);

    await writeNote(
      workspaceRoot,
      path.join('memory', 'daily', '2026', '04', '2026-04-01-stable-summary.md'),
      [
        '## Key Points',
        '',
        '- Stable memory still matters without explicit cues'
      ].join('\n')
    );

    const db: ContentGenDbDeps = {
      listNotesByDate: vi.fn(async () => []),
      listNotesByWorkspace: vi.fn(async () => [
        {
          id: 'note-stable',
          date: '2026-04-01',
          filePath: 'memory/daily/2026/04/2026-04-01-stable-summary.md',
          topics: JSON.stringify(['Stable Summary']),
          summary: 'A stable summary should backfill critical facts when no recall cues exist.',
          importance: 0.9,
          stability: 0.95
        }
      ]),
      listAllTopics: vi.fn(async () => [
        {
          id: 'topic_stable_summary',
          label: 'Stable Summary',
          slug: 'stable-summary',
          heat: 0.7,
          noteCount: 1
        }
      ]),
      listNotesByTopicId: vi.fn(async () => [])
    };

    await generateMemoryIndex(workspaceRoot, db, 'ws-1');
    const memoryMd = await readFile(path.join(workspaceRoot, 'memory', 'MEMORY.md'), 'utf-8');

    expect(memoryMd).toContain('## Critical Facts');
    expect(memoryMd).toContain('Stable Summary');
    expect(memoryMd).toContain('A stable summary should backfill critical facts when no recall cues exist.');
  });

  it('emits lifecycle suggestions for archive, freeze, refresh, and compaction candidates', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'chobits-memory-content-lifecycle-'));
    tempDirs.push(workspaceRoot);

    await writeNote(
      workspaceRoot,
      path.join('memory', 'daily', '2025', '12', '2025-12-01-archive-candidate.md'),
      [
        '## Key Points',
        '',
        '- Keep the long-term architecture decision searchable.'
      ].join('\n')
    );

    await writeNote(
      workspaceRoot,
      path.join('memory', 'daily', '2026', '03', '2026-03-10-freeze-candidate.md'),
      [
        '## Key Points',
        '',
        '- The migration plan is settled and no longer changing.',
        '',
        '## Recall Cues',
        '',
        '- [principle] Keep the migration workflow stable after rollout'
      ].join('\n')
    );

    await writeNote(
      workspaceRoot,
      path.join('memory', 'daily', '2026', '01', '2026-01-20-refresh-candidate.md'),
      [
        '## Key Points',
        '',
        '- This note still matters but its implementation details may be stale.',
        '',
        '## Recall Cues',
        '',
        '- [event] Re-check the aging rollout assumptions before reusing them'
      ].join('\n')
    );

    await writeNote(
      workspaceRoot,
      path.join('memory', 'daily', '2026', '03', '2026-03-20-compact-candidate.md'),
      [
        '## Key Points',
        '',
        `- ${'Dense implementation detail '.repeat(60).trim()}`,
        '',
        '## Source Excerpts',
        '',
        `> ${'Quoted evidence '.repeat(40).trim()}`
      ].join('\n')
    );

    const db: ContentGenDbDeps = {
      listNotesByDate: vi.fn(async () => []),
      listNotesByWorkspace: vi.fn(async () => [
        {
          id: 'note-archive',
          date: '2025-12-01',
          filePath: 'memory/daily/2025/12/2025-12-01-archive-candidate.md',
          topics: JSON.stringify(['Archive Candidate']),
          summary: 'A resolved long-term architecture decision can leave the active working set.',
          importance: 0.84,
          stability: 0.91
        },
        {
          id: 'note-freeze',
          date: '2026-03-10',
          filePath: 'memory/daily/2026/03/2026-03-10-freeze-candidate.md',
          topics: JSON.stringify(['Freeze Candidate']),
          summary: 'The migration workflow has stabilized and can be frozen unless new evidence appears.',
          importance: 0.78,
          stability: 0.9
        },
        {
          id: 'note-refresh',
          date: '2026-01-20',
          filePath: 'memory/daily/2026/01/2026-01-20-refresh-candidate.md',
          topics: JSON.stringify(['Refresh Candidate']),
          summary: 'This rollout guidance is still important, but it is old enough that it should be refreshed.',
          importance: 0.81,
          stability: 0.54
        },
        {
          id: 'note-compact',
          date: '2026-03-20',
          filePath: 'memory/daily/2026/03/2026-03-20-compact-candidate.md',
          topics: JSON.stringify(['Compact Candidate']),
          summary: 'This memory note has grown too dense and should be compacted into a tighter summary.',
          importance: 0.79,
          stability: 0.66
        }
      ]),
      listAllTopics: vi.fn(async () => [
        { id: 'topic_archive_candidate', label: 'Archive Candidate', slug: 'archive-candidate', heat: 0.8, noteCount: 1 },
        { id: 'topic_freeze_candidate', label: 'Freeze Candidate', slug: 'freeze-candidate', heat: 0.8, noteCount: 1 },
        { id: 'topic_refresh_candidate', label: 'Refresh Candidate', slug: 'refresh-candidate', heat: 0.8, noteCount: 1 },
        { id: 'topic_compact_candidate', label: 'Compact Candidate', slug: 'compact-candidate', heat: 0.8, noteCount: 1 }
      ]),
      listNotesByTopicId: vi.fn(async () => [])
    };

    await generateMemoryIndex(workspaceRoot, db, 'ws-1');
    const memoryMd = await readFile(path.join(workspaceRoot, 'memory', 'MEMORY.md'), 'utf-8');

    expect(memoryMd).toContain('## Lifecycle Suggestions');
    expect(memoryMd).toContain('[archive] Archive Candidate');
    expect(memoryMd).toContain('[freeze] Freeze Candidate');
    expect(memoryMd).toContain('[refresh] Refresh Candidate');
    expect(memoryMd).toContain('[compact] Compact Candidate');
  });
});
