import fs from 'node:fs';
import path from 'node:path';

import { and, desc, eq, gte, inArray, isNull, like, lte, sql } from 'drizzle-orm';

import { getRelativeMemoryDate } from '../../../packages/ai/services/memory-date';
import { parseFrontmatter, readLines } from '../../../packages/ai/services/memory-note-parser';
import { getDB, getOrm } from '.';
import {
  memory_edges,
  memory_keywords,
  memory_note_keywords,
  memory_notes,
  memory_sections,
  memory_sync_jobs,
  memory_topics,
  type MemoryEdgeRow,
  type MemoryKeywordRow,
  type MemoryNoteKeywordRow,
  type MemoryNoteRow,
  type MemorySectionRow,
  type MemorySyncJobRow,
  type MemoryTopicRow,
  type NewMemoryEdge,
  type NewMemoryKeyword,
  type NewMemoryNote,
  type NewMemoryNoteKeyword,
  type NewMemorySection,
  type NewMemorySyncJob,
  type NewMemoryTopic
} from './schema';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Memory System Repositories
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * MemoryNoteRepo — 记忆 Note 索引表操作
 */
export const MemoryNoteRepo = {
  async upsert(note: NewMemoryNote): Promise<MemoryNoteRow | undefined> {
    const db = getOrm();

    // 检查是否存在同 workspace + filePath 但不同 id 的记录（LLM 重复生成相同 slug 但不同随机 id）
    if (note.filePath) {
      const wheres: any[] = [eq(memory_notes.filePath, note.filePath)];
      if (note.workspaceId) wheres.push(eq(memory_notes.workspaceId, note.workspaceId));
      else wheres.push(isNull(memory_notes.workspaceId));

      const existingByPath = await db
        .select()
        .from(memory_notes)
        .where(and(...wheres))
        .limit(1);
      if (existingByPath[0] && existingByPath[0].id !== note.id) {
        console.log(`[MemoryNoteRepo:upsert] workspace+filePath conflict: ws=${note.workspaceId || 'null'}, existing id=${existingByPath[0].id}, new id=${note.id}. Reusing existing id.`);
        // 使用已有记录的 id 进行更新，避免 UNIQUE(workspace_id, file_path) 冲突
        (note as any).id = existingByPath[0].id;
      }
    }

    const rows = await db
      .insert(memory_notes)
      .values(note as any)
      .onConflictDoUpdate({
        target: memory_notes.id,
        set: { ...(note as any), updatedAt: Date.now() }
      })
      .returning()
      .all();
    return rows[0];
  },

  async getById(id: string): Promise<MemoryNoteRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(memory_notes).where(eq(memory_notes.id, id)).limit(1);
    return rows[0];
  },

  async getByFilePath(filePath: string, workspaceId?: string | null): Promise<MemoryNoteRow | undefined> {
    const db = getOrm();
    const wheres: any[] = [eq(memory_notes.filePath, filePath)];
    if (workspaceId) wheres.push(eq(memory_notes.workspaceId, workspaceId));
    else wheres.push(isNull(memory_notes.workspaceId));
    const rows = await db
      .select()
      .from(memory_notes)
      .where(and(...wheres))
      .limit(1);
    return rows[0];
  },

  async listByDate(date: string, workspaceId?: string): Promise<MemoryNoteRow[]> {
    const db = getOrm();
    const wheres: any[] = [eq(memory_notes.date, date), isNull(memory_notes.deletedAt)];
    if (workspaceId) wheres.push(eq(memory_notes.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_notes)
      .where(and(...wheres))
      .orderBy(desc(memory_notes.importance));
  },

  async listByDateRange(startDate: string, endDate: string, workspaceId?: string): Promise<MemoryNoteRow[]> {
    const db = getOrm();
    const wheres: any[] = [gte(memory_notes.date, startDate), lte(memory_notes.date, endDate), isNull(memory_notes.deletedAt)];
    if (workspaceId) wheres.push(eq(memory_notes.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_notes)
      .where(and(...wheres))
      .orderBy(desc(memory_notes.date), desc(memory_notes.importance));
  },

  async listByWorkspace(workspaceId: string, limit = 100, offset = 0): Promise<MemoryNoteRow[]> {
    const db = getOrm();
    return db
      .select()
      .from(memory_notes)
      .where(and(eq(memory_notes.workspaceId, workspaceId), isNull(memory_notes.deletedAt)))
      .orderBy(desc(memory_notes.date), desc(memory_notes.importance))
      .limit(limit)
      .offset(offset);
  },

  async listByTopicId(topicId: string, workspaceId?: string, limit = 50): Promise<MemoryNoteRow[]> {
    const db = getOrm();
    // 通过 memory_edges 查找属于该 topic 的 notes
    const rawDb = getDB();
    if (!rawDb) return [];
    const noteIds = rawDb
      .prepare(
        `SELECT DISTINCT target_id FROM memory_edges
         WHERE source_type = 'topic' AND source_id = ?
           AND target_type = 'note'
           AND relation_type IN ('belongs_to_topic', 'related_to_topic')
         LIMIT ?`
      )
      .all(topicId, limit) as { target_id: string }[];
    if (!noteIds.length) return [];
    const ids = noteIds.map((r) => r.target_id);
    const wheres: any[] = [inArray(memory_notes.id, ids), isNull(memory_notes.deletedAt)];
    if (workspaceId) wheres.push(eq(memory_notes.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_notes)
      .where(and(...wheres))
      .orderBy(desc(memory_notes.date), desc(memory_notes.importance));
  },

  /** 按重要度和时间获取近期高重要度 note（用于自动注入） */
  async listRecentImportant(workspaceId: string, minImportance = 0.7, days = 7, limit = 10): Promise<MemoryNoteRow[]> {
    const db = getOrm();
    const cutoffDate = getRelativeMemoryDate(-days);
    return db
      .select()
      .from(memory_notes)
      .where(and(eq(memory_notes.workspaceId, workspaceId), isNull(memory_notes.deletedAt), gte(memory_notes.date, cutoffDate), gte(memory_notes.importance, minImportance)))
      .orderBy(desc(memory_notes.importance), desc(memory_notes.date))
      .limit(limit);
  },

  async softDelete(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const now = Date.now();
    const res = await db
      .update(memory_notes)
      .set({ deletedAt: now, updatedAt: now } as any)
      .where(inArray(memory_notes.id, ids))
      .run();
    return (res as any).changes ?? 0;
  },

  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    // cascade 会自动删除 sections 和 note_keywords
    const res = await db.delete(memory_notes).where(inArray(memory_notes.id, ids)).run();
    return (res as any).changes ?? 0;
  },

  async update(id: string, patch: Partial<NewMemoryNote>): Promise<MemoryNoteRow | undefined> {
    const db = getOrm();
    await db
      .update(memory_notes)
      .set({ ...patch, updatedAt: Date.now() } as any)
      .where(eq(memory_notes.id, id))
      .run();
    return this.getById(id);
  },

  async count(workspaceId?: string): Promise<number> {
    const db = getOrm();
    const wheres: any[] = [isNull(memory_notes.deletedAt)];
    if (workspaceId) wheres.push(eq(memory_notes.workspaceId, workspaceId));
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(memory_notes)
      .where(and(...wheres));
    return (rows[0] as any)?.count ?? 0;
  },

  /** 查找包含指定 conversationId 的 notes（用于水位查询） */
  async findByConversationId(conversationId: string, workspaceId?: string): Promise<MemoryNoteRow[]> {
    const rawDb = getDB();
    if (!rawDb) return [];

    const params: string[] = [conversationId];
    let sql = `
      SELECT *
      FROM memory_notes
      WHERE deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM json_each(memory_notes.source_conversation_ids)
          WHERE json_each.value = ?
        )
    `;

    if (workspaceId) {
      sql += ' AND workspace_id = ?';
      params.push(workspaceId);
    }

    return rawDb.prepare(sql).all(...params) as MemoryNoteRow[];
  },

  /**
   * 从 note 的 sourceConversationIds 中移除指定 conversationId。
   * 返回更新后的 note（如果 sourceConversationIds 变空则返回 null 表示应删除）。
   */
  async removeConversationSource(conversationId: string): Promise<{
    updated: MemoryNoteRow[];
    orphaned: MemoryNoteRow[];
  }> {
    const notes = await this.findByConversationId(conversationId);
    const updated: MemoryNoteRow[] = [];
    const orphaned: MemoryNoteRow[] = [];

    for (const note of notes) {
      const convIds = safeJsonParse(note.sourceConversationIds, []);
      const remaining = convIds.filter((id: string) => id !== conversationId);

      // 同时清理 sourceMessageRange 中该 conversation 的条目
      const msgRanges = safeJsonParse(note.sourceMessageRange, []);
      const remainingRanges = msgRanges.filter((r: any) => r?.conversationId !== conversationId);

      if (remaining.length === 0) {
        // 所有来源对话都被删了 → 标记为应删除
        orphaned.push(note);
      } else {
        // 还有其他来源 → 更新 sourceConversationIds
        await this.update(note.id, {
          sourceConversationIds: JSON.stringify(remaining),
          sourceMessageRange: remainingRanges.length ? JSON.stringify(remainingRanges) : null
        } as any);
        const updatedNote = await this.getById(note.id);
        if (updatedNote) updated.push(updatedNote);
      }
    }

    return { updated, orphaned };
  },

  /**
   * 模糊搜索 notes — 通过 LIKE 匹配 summary、keywords、topics 字段。
   * 用于弥补 FTS5 在中文分词场景下的不足。
   */
  async searchByTerms(terms: string[], workspaceId?: string, limit = 20): Promise<MemoryNoteRow[]> {
    if (!terms.length) return [];
    const rawDb = getDB();
    if (!rawDb) return [];

    // Build OR conditions: each term matches summary, keywords, or topics
    const conditions: string[] = [];
    const params: string[] = [];
    for (const term of terms) {
      if (!term.trim()) continue;
      const safeTerm = `%${term.trim()}%`;
      conditions.push('(summary LIKE ? OR keywords LIKE ? OR topics LIKE ?)');
      params.push(safeTerm, safeTerm, safeTerm);
    }
    if (!conditions.length) return [];

    let sql = `SELECT * FROM memory_notes WHERE deleted_at IS NULL AND (${conditions.join(' OR ')})`;
    if (workspaceId) {
      sql += ` AND workspace_id = ?`;
      params.push(workspaceId);
    }
    sql += ` ORDER BY importance DESC, date DESC LIMIT ?`;
    params.push(String(limit));

    return rawDb.prepare(sql).all(...params) as MemoryNoteRow[];
  }
};

/**
 * MemorySectionRepo — 段落索引表操作
 */
export const MemorySectionRepo = {
  /** 重建某 note 的所有 section（先删后插） */
  async rebuildForNote(noteId: string, sections: NewMemorySection[]): Promise<MemorySectionRow[]> {
    const db = getOrm();
    const results: MemorySectionRow[] = [];
    (db as any).transaction((tx: any) => {
      tx.delete(memory_sections).where(eq(memory_sections.noteId, noteId)).run();
      for (const sec of sections) {
        const rows = tx
          .insert(memory_sections)
          .values({ ...sec, noteId } as any)
          .returning()
          .all();
        if (rows[0]) results.push(rows[0]);
      }
    });
    return results;
  },

  async listByNote(noteId: string): Promise<MemorySectionRow[]> {
    const db = getOrm();
    return db.select().from(memory_sections).where(eq(memory_sections.noteId, noteId)).orderBy(memory_sections.sectionOrder);
  },

  async getById(id: string): Promise<MemorySectionRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(memory_sections).where(eq(memory_sections.id, id)).limit(1);
    return rows[0];
  },

  async deleteByNote(noteId: string): Promise<number> {
    const db = getOrm();
    const res = await db.delete(memory_sections).where(eq(memory_sections.noteId, noteId)).run();
    return (res as any).changes ?? 0;
  }
};

/**
 * MemoryTopicRepo — 主题节点表操作
 */
export const MemoryTopicRepo = {
  async upsert(topic: NewMemoryTopic): Promise<MemoryTopicRow | undefined> {
    const db = getOrm();
    const rows = await db
      .insert(memory_topics)
      .values(topic as any)
      .onConflictDoUpdate({
        target: memory_topics.id,
        set: { ...(topic as any), updatedAt: Date.now() }
      })
      .returning()
      .all();
    return rows[0];
  },

  async getById(id: string): Promise<MemoryTopicRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(memory_topics).where(eq(memory_topics.id, id)).limit(1);
    return rows[0];
  },

  async findBySlug(slug: string, workspaceId?: string): Promise<MemoryTopicRow | undefined> {
    const db = getOrm();
    const wheres: any[] = [eq(memory_topics.slug, slug), isNull(memory_topics.deletedAt)];
    if (workspaceId) wheres.push(eq(memory_topics.workspaceId, workspaceId));
    const rows = await db
      .select()
      .from(memory_topics)
      .where(and(...wheres))
      .limit(1);
    return rows[0];
  },

  async findByLabel(label: string, workspaceId?: string): Promise<MemoryTopicRow[]> {
    const db = getOrm();
    const wheres: any[] = [like(memory_topics.label, `%${label}%`), isNull(memory_topics.deletedAt)];
    if (workspaceId) wheres.push(eq(memory_topics.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_topics)
      .where(and(...wheres))
      .orderBy(desc(memory_topics.heat))
      .limit(10);
  },

  /** 搜索 topic（label / slug / aliases 匹配） */
  async search(term: string, workspaceId?: string, limit = 10): Promise<MemoryTopicRow[]> {
    const rawDb = getDB();
    if (!rawDb) return [];
    const likeTerm = `%${term}%`;
    const params: any[] = [likeTerm, likeTerm, likeTerm];
    let wsClause = '';
    if (workspaceId) {
      wsClause = ' AND workspace_id = ?';
      params.push(workspaceId);
    }
    params.push(limit);
    return rawDb
      .prepare(
        `SELECT * FROM memory_topics
         WHERE deleted_at IS NULL
           AND (label LIKE ? OR slug LIKE ? OR aliases LIKE ?)
           ${wsClause}
         ORDER BY heat DESC
         LIMIT ?`
      )
      .all(...params) as MemoryTopicRow[];
  },

  async listChildren(parentId: string): Promise<MemoryTopicRow[]> {
    const db = getOrm();
    return db
      .select()
      .from(memory_topics)
      .where(and(eq(memory_topics.parentId, parentId), isNull(memory_topics.deletedAt)))
      .orderBy(desc(memory_topics.heat));
  },

  /** 列出根主题（无父级），按活跃度排序 */
  async listRoots(workspaceId?: string, limit = 20): Promise<MemoryTopicRow[]> {
    const db = getOrm();
    const wheres: any[] = [isNull(memory_topics.parentId), isNull(memory_topics.deletedAt)];
    if (workspaceId) wheres.push(eq(memory_topics.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_topics)
      .where(and(...wheres))
      .orderBy(desc(memory_topics.heat))
      .limit(limit);
  },

  async updateHeat(id: string, heatDelta: number): Promise<void> {
    const rawDb = getDB();
    if (!rawDb) return;
    rawDb
      .prepare(
        `UPDATE memory_topics
         SET heat = MIN(1.0, MAX(0.0, heat + ?)),
             note_count = note_count + 1,
             last_seen_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(heatDelta, Date.now(), Date.now(), id);
  },

  async update(id: string, patch: Partial<NewMemoryTopic>): Promise<MemoryTopicRow | undefined> {
    const db = getOrm();
    await db
      .update(memory_topics)
      .set({ ...patch, updatedAt: Date.now() } as any)
      .where(eq(memory_topics.id, id))
      .run();
    return this.getById(id);
  },

  /** 列出工作空间内所有主题（用于图谱全局可视化） */
  async listAll(workspaceId?: string, limit = 200): Promise<MemoryTopicRow[]> {
    const db = getOrm();
    const wheres: any[] = [isNull(memory_topics.deletedAt)];
    if (workspaceId) wheres.push(eq(memory_topics.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_topics)
      .where(and(...wheres))
      .orderBy(desc(memory_topics.heat))
      .limit(limit);
  },

  async count(workspaceId?: string): Promise<number> {
    const db = getOrm();
    const wheres: any[] = [isNull(memory_topics.deletedAt)];
    if (workspaceId) wheres.push(eq(memory_topics.workspaceId, workspaceId));
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(memory_topics)
      .where(and(...wheres));
    return (rows[0] as any)?.count ?? 0;
  },

  /** 按 domain 查找主题（I-4: 命名空间过滤） */
  async findByDomain(domain: string, workspaceId?: string, limit = 20): Promise<MemoryTopicRow[]> {
    const db = getOrm();
    const wheres: any[] = [isNull(memory_topics.deletedAt), eq(memory_topics.domain, domain)];
    if (workspaceId) wheres.push(eq(memory_topics.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_topics)
      .where(and(...wheres))
      .orderBy(desc(memory_topics.heat))
      .limit(limit);
  },

  /** 按 domainType 查找主题 */
  async findByDomainType(domainType: string, workspaceId?: string, limit = 50): Promise<MemoryTopicRow[]> {
    const db = getOrm();
    const wheres: any[] = [isNull(memory_topics.deletedAt), eq(memory_topics.domainType, domainType as any)];
    if (workspaceId) wheres.push(eq(memory_topics.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_topics)
      .where(and(...wheres))
      .orderBy(desc(memory_topics.heat))
      .limit(limit);
  },

  /**
   * 对所有主题执行 heat 衰减。
   * 使用指数衰减：heat = heat * decayFactor
   * 默认 decayFactor = 0.95（约 14 天半衰期）。
   * 只衰减 heat > 0.01 的主题，低于阈值的直接归零。
   * 返回受影响的行数。
   */
  applyHeatDecay(decayFactor = 0.95, workspaceId?: string): number {
    const rawDb = getDB();
    if (!rawDb) return 0;
    const now = Date.now();
    let sql: string;
    const params: any[] = [decayFactor, now];

    if (workspaceId) {
      sql = `UPDATE memory_topics
             SET heat = CASE WHEN heat * ? < 0.01 THEN 0.0 ELSE heat * ? END,
                 updated_at = ?
             WHERE deleted_at IS NULL AND heat > 0.0 AND workspace_id = ?`;
      params.splice(1, 0, decayFactor); // need two copies of decayFactor
      params.push(workspaceId);
    } else {
      sql = `UPDATE memory_topics
             SET heat = CASE WHEN heat * ? < 0.01 THEN 0.0 ELSE heat * ? END,
                 updated_at = ?
             WHERE deleted_at IS NULL AND heat > 0.0`;
      params.splice(1, 0, decayFactor); // need two copies of decayFactor
    }

    const res = rawDb.prepare(sql).run(...params);
    return (res as any).changes ?? 0;
  }
};

/**
 * MemoryEdgeRepo — 图谱边表操作
 */
export const MemoryEdgeRepo = {
  async upsert(edge: NewMemoryEdge): Promise<MemoryEdgeRow | undefined> {
    const db = getOrm();
    const rows = await db
      .insert(memory_edges)
      .values(edge as any)
      .onConflictDoUpdate({
        target: [memory_edges.sourceType, memory_edges.sourceId, memory_edges.targetType, memory_edges.targetId, memory_edges.relationType],
        set: { weight: (edge as any).weight ?? 1.0, updatedAt: Date.now() }
      })
      .returning()
      .all();
    return rows[0];
  },

  async bulkUpsert(edges: NewMemoryEdge[]): Promise<number> {
    if (!edges.length) return 0;
    let count = 0;
    for (const edge of edges) {
      const result = await this.upsert(edge);
      if (result) count++;
    }
    return count;
  },

  async findBySource(sourceType: string, sourceId: string, relationType?: string): Promise<MemoryEdgeRow[]> {
    const db = getOrm();
    const wheres: any[] = [eq(memory_edges.sourceType, sourceType as any), eq(memory_edges.sourceId, sourceId)];
    if (relationType) wheres.push(eq(memory_edges.relationType, relationType as any));
    return db
      .select()
      .from(memory_edges)
      .where(and(...wheres));
  },

  async findByTarget(targetType: string, targetId: string, relationType?: string): Promise<MemoryEdgeRow[]> {
    const db = getOrm();
    const wheres: any[] = [eq(memory_edges.targetType, targetType as any), eq(memory_edges.targetId, targetId)];
    if (relationType) wheres.push(eq(memory_edges.relationType, relationType as any));
    return db
      .select()
      .from(memory_edges)
      .where(and(...wheres));
  },

  /** 删除与某 note 相关的所有边 */
  async deleteByNote(noteId: string): Promise<number> {
    const rawDb = getDB();
    if (!rawDb) return 0;
    const res = rawDb
      .prepare(
        `DELETE FROM memory_edges
         WHERE (source_type = 'note' AND source_id = ?)
            OR (target_type = 'note' AND target_id = ?)`
      )
      .run(noteId, noteId);
    return (res as any).changes ?? 0;
  },

  /** 查找两个 topic 之间通过边关联的 topic IDs（1 层扩展） */
  async findAdjacentTopics(topicIds: string[], limit = 20): Promise<MemoryEdgeRow[]> {
    const rawDb = getDB();
    if (!rawDb || !topicIds.length) return [];
    const placeholders = topicIds.map(() => '?').join(',');
    return rawDb
      .prepare(
        `SELECT * FROM memory_edges
         WHERE source_type = 'topic' AND source_id IN (${placeholders})
           AND target_type = 'topic'
           AND relation_type IN ('parent_topic_of', 'related_to_topic')
         LIMIT ?`
      )
      .all(...topicIds, limit) as MemoryEdgeRow[];
  },

  /** 列出工作空间内所有边（用于图谱全局可视化） */
  async listAll(workspaceId?: string, limit = 500): Promise<MemoryEdgeRow[]> {
    const db = getOrm();
    const wheres: any[] = [];
    if (workspaceId) wheres.push(eq(memory_edges.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_edges)
      .where(wheres.length ? and(...wheres) : undefined)
      .limit(limit);
  },

  async count(workspaceId?: string): Promise<number> {
    const db = getOrm();
    const wheres: any[] = [];
    if (workspaceId) wheres.push(eq(memory_edges.workspaceId, workspaceId));
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(memory_edges)
      .where(wheres.length ? and(...wheres) : undefined);
    return (rows[0] as any)?.count ?? 0;
  },

  // ━━ 实体事实操作（I-3: 时序实体知识图谱） ━━

  /** 添加实体事实边 (entity_fact/entity_attribute/entity_relation) */
  async addEntityFact(fact: {
    subject: string;
    predicate: string;
    object: string;
    relationType?: 'entity_fact' | 'entity_attribute' | 'entity_relation';
    validFrom?: number;
    confidence?: number;
    evidenceNoteId?: string;
    workspaceId?: string;
  }): Promise<MemoryEdgeRow | undefined> {
    const db = getOrm();
    const edge: NewMemoryEdge = {
      sourceType: 'note',
      sourceId: fact.subject,
      targetType: 'note',
      targetId: fact.object,
      relationType: fact.relationType || 'entity_fact',
      weight: 1.0,
      evidenceNoteId: fact.evidenceNoteId,
      evidenceSnippet: fact.predicate,
      origin: 'llm_extracted',
      validFrom: fact.validFrom ?? Date.now(),
      confidence: fact.confidence ?? 1.0,
      workspaceId: fact.workspaceId
    };
    const rows = await db
      .insert(memory_edges)
      .values(edge as any)
      .onConflictDoUpdate({
        target: [memory_edges.sourceType, memory_edges.sourceId, memory_edges.targetType, memory_edges.targetId, memory_edges.relationType],
        set: { weight: 1.0, validFrom: edge.validFrom, confidence: edge.confidence, updatedAt: Date.now() }
      })
      .returning()
      .all();
    return rows[0];
  },

  /** 标记实体事实过期 */
  async invalidateEntityFact(subject: string, predicate: string, object: string, validTo: number): Promise<void> {
    const rawDb = getDB();
    if (!rawDb) return;
    rawDb
      .prepare(
        `UPDATE memory_edges
         SET valid_to = ?, updated_at = ?
         WHERE source_id = ? AND target_id = ? AND evidence_snippet = ?
           AND relation_type IN ('entity_fact', 'entity_attribute', 'entity_relation')
           AND valid_to IS NULL`
      )
      .run(validTo, Date.now(), subject, object, predicate);
  },

  /** 查询实体的当前有效事实 */
  async queryEntityFacts(entity: string, opts?: { asOf?: number; workspaceId?: string; limit?: number }): Promise<MemoryEdgeRow[]> {
    const rawDb = getDB();
    if (!rawDb) return [];
    const asOf = opts?.asOf ?? Date.now();
    const limit = opts?.limit ?? 50;

    let sql = `SELECT * FROM memory_edges
      WHERE (source_id = ? OR target_id = ?)
        AND relation_type IN ('entity_fact', 'entity_attribute', 'entity_relation')
        AND (valid_from IS NULL OR valid_from <= ?)
        AND (valid_to IS NULL OR valid_to > ?)`;
    const params: any[] = [entity, entity, asOf, asOf];

    if (opts?.workspaceId) {
      sql += ` AND workspace_id = ?`;
      params.push(opts.workspaceId);
    }
    sql += ` ORDER BY valid_from DESC LIMIT ?`;
    params.push(limit);

    return rawDb.prepare(sql).all(...params) as MemoryEdgeRow[];
  },

  /** 查询实体的完整时间线（包括已过期的事实） */
  async entityTimeline(entity: string, workspaceId?: string): Promise<MemoryEdgeRow[]> {
    const rawDb = getDB();
    if (!rawDb) return [];

    let sql = `SELECT * FROM memory_edges
      WHERE (source_id = ? OR target_id = ?)
        AND relation_type IN ('entity_fact', 'entity_attribute', 'entity_relation')`;
    const params: any[] = [entity, entity];

    if (workspaceId) {
      sql += ` AND workspace_id = ?`;
      params.push(workspaceId);
    }
    sql += ` ORDER BY valid_from ASC`;

    return rawDb.prepare(sql).all(...params) as MemoryEdgeRow[];
  }
};

/**
 * MemoryKeywordRepo — 关键词规范化表操作
 */
export const MemoryKeywordRepo = {
  /** 按 canonical 查找或创建关键词 */
  async upsertCanonical(keyword: NewMemoryKeyword): Promise<MemoryKeywordRow | undefined> {
    const db = getOrm();
    const rows = await db
      .insert(memory_keywords)
      .values(keyword as any)
      .onConflictDoUpdate({
        target: [memory_keywords.canonical, memory_keywords.workspaceId],
        set: {
          aliases: (keyword as any).aliases,
          entityType: (keyword as any).entityType,
          occurrenceCount: sql`occurrence_count + 1`,
          lastSeenAt: Date.now(),
          updatedAt: Date.now()
        }
      })
      .returning()
      .all();
    return rows[0];
  },

  async findByCanonical(canonical: string, workspaceId?: string): Promise<MemoryKeywordRow | undefined> {
    const db = getOrm();
    const wheres: any[] = [eq(memory_keywords.canonical, canonical)];
    if (workspaceId) wheres.push(eq(memory_keywords.workspaceId, workspaceId));
    const rows = await db
      .select()
      .from(memory_keywords)
      .where(and(...wheres))
      .limit(1);
    return rows[0];
  },

  async findByAlias(alias: string, workspaceId?: string): Promise<MemoryKeywordRow[]> {
    const db = getOrm();
    const wheres: any[] = [like(memory_keywords.aliases, `%${alias}%`)];
    if (workspaceId) wheres.push(eq(memory_keywords.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_keywords)
      .where(and(...wheres))
      .limit(10);
  },

  /** 按主题关联查关键词 */
  async findByTopicId(topicId: string): Promise<MemoryKeywordRow[]> {
    const db = getOrm();
    return db.select().from(memory_keywords).where(eq(memory_keywords.primaryTopicId, topicId));
  },

  async getById(id: string): Promise<MemoryKeywordRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(memory_keywords).where(eq(memory_keywords.id, id)).limit(1);
    return rows[0];
  },

  /** 列出 workspace 中的所有关键词（按出现次数排序） */
  async listAll(workspaceId?: string, limit = 300): Promise<MemoryKeywordRow[]> {
    const db = getOrm();
    const wheres: any[] = [];
    if (workspaceId) wheres.push(eq(memory_keywords.workspaceId, workspaceId));
    return db
      .select()
      .from(memory_keywords)
      .where(wheres.length ? and(...wheres) : undefined)
      .orderBy(desc(memory_keywords.occurrenceCount))
      .limit(limit);
  }
};

/**
 * MemoryNoteKeywordRepo — Note ↔ Keyword 关联表操作
 */
export const MemoryNoteKeywordRepo = {
  /** 批量写入 note-keyword 关联（先删旧的再批量插入） */
  async rebuildForNote(noteId: string, links: NewMemoryNoteKeyword[]): Promise<number> {
    const db = getOrm();
    let count = 0;
    (db as any).transaction((tx: any) => {
      tx.delete(memory_note_keywords).where(eq(memory_note_keywords.noteId, noteId)).run();
      for (const link of links) {
        tx.insert(memory_note_keywords)
          .values({ ...link, noteId } as any)
          .run();
        count++;
      }
    });
    return count;
  },

  async listByNote(noteId: string): Promise<MemoryNoteKeywordRow[]> {
    const db = getOrm();
    return db.select().from(memory_note_keywords).where(eq(memory_note_keywords.noteId, noteId));
  },

  async listByKeyword(keywordId: string): Promise<MemoryNoteKeywordRow[]> {
    const db = getOrm();
    return db.select().from(memory_note_keywords).where(eq(memory_note_keywords.keywordId, keywordId));
  },

  async deleteByNote(noteId: string): Promise<number> {
    const db = getOrm();
    const res = await db.delete(memory_note_keywords).where(eq(memory_note_keywords.noteId, noteId)).run();
    return (res as any).changes ?? 0;
  },

  /** 列出 workspace 中所有 note-keyword 关联（用于图谱绘制） */
  async listAllByWorkspace(workspaceId: string, limit = 1000): Promise<MemoryNoteKeywordRow[]> {
    const db = getOrm();
    // 通过 join memory_keywords 筛选 workspace
    return db
      .select({
        id: memory_note_keywords.id,
        noteId: memory_note_keywords.noteId,
        keywordId: memory_note_keywords.keywordId,
        scope: memory_note_keywords.scope,
        sectionId: memory_note_keywords.sectionId,
        relevance: memory_note_keywords.relevance,
        createdAt: memory_note_keywords.createdAt
      })
      .from(memory_note_keywords)
      .innerJoin(memory_keywords, eq(memory_note_keywords.keywordId, memory_keywords.id))
      .where(eq(memory_keywords.workspaceId, workspaceId))
      .limit(limit);
  }
};

/**
 * MemorySyncJobRepo — 记忆提取任务表操作
 */
export const MemorySyncJobRepo = {
  async create(job: NewMemorySyncJob): Promise<MemorySyncJobRow | undefined> {
    const db = getOrm();
    const rows = await db
      .insert(memory_sync_jobs)
      .values(job as any)
      .returning()
      .all();
    return rows[0];
  },

  async getById(id: string): Promise<MemorySyncJobRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(memory_sync_jobs).where(eq(memory_sync_jobs.id, id)).limit(1);
    return rows[0];
  },

  async updateStatus(id: string, status: string, extra?: Partial<MemorySyncJobRow>): Promise<void> {
    const db = getOrm();
    await db
      .update(memory_sync_jobs)
      .set({ status, ...extra } as any)
      .where(eq(memory_sync_jobs.id, id))
      .run();
  },

  async updateProgress(id: string, progress: string): Promise<void> {
    const db = getOrm();
    await db
      .update(memory_sync_jobs)
      .set({ progress } as any)
      .where(eq(memory_sync_jobs.id, id))
      .run();
  },

  async findByStatus(status: string): Promise<MemorySyncJobRow[]> {
    const db = getOrm();
    return db
      .select()
      .from(memory_sync_jobs)
      .where(eq(memory_sync_jobs.status, status as any))
      .orderBy(desc(memory_sync_jobs.createdAt));
  },

  async getLatest(workspaceId?: string): Promise<MemorySyncJobRow | undefined> {
    const db = getOrm();
    const wheres: any[] = [];
    if (workspaceId) wheres.push(eq(memory_sync_jobs.workspaceId, workspaceId));
    const rows = await db
      .select()
      .from(memory_sync_jobs)
      .where(wheres.length ? and(...wheres) : undefined)
      .orderBy(desc(memory_sync_jobs.createdAt))
      .limit(1);
    return rows[0];
  },

  async getLatestCompleted(workspaceId?: string): Promise<MemorySyncJobRow | undefined> {
    const db = getOrm();
    const wheres: any[] = [eq(memory_sync_jobs.status, 'completed')];
    if (workspaceId) wheres.push(eq(memory_sync_jobs.workspaceId, workspaceId));
    const rows = await db
      .select()
      .from(memory_sync_jobs)
      .where(and(...wheres))
      .orderBy(desc(memory_sync_jobs.completedAt))
      .limit(1);
    return rows[0];
  },

  async list(limit = 20, offset = 0): Promise<MemorySyncJobRow[]> {
    const db = getOrm();
    return db.select().from(memory_sync_jobs).orderBy(desc(memory_sync_jobs.createdAt)).limit(limit).offset(offset);
  },

  async findByWorkspace(workspaceId: string, limit = 100): Promise<MemorySyncJobRow[]> {
    const db = getOrm();
    return db.select().from(memory_sync_jobs).where(eq(memory_sync_jobs.workspaceId, workspaceId)).orderBy(desc(memory_sync_jobs.createdAt)).limit(limit);
  },

  async getAll(limit = 100): Promise<MemorySyncJobRow[]> {
    const db = getOrm();
    return db.select().from(memory_sync_jobs).orderBy(desc(memory_sync_jobs.createdAt)).limit(limit);
  }
};

/**
 * MemoryFTSRepo — FTS5 虚拟表操作（raw SQL）
 * memory_notes_fts 是 contentless FTS5 表，需要手动管理 INSERT/DELETE。
 */
export const MemoryFTSRepo = {
  /** 插入 note 级 FTS 条目 */
  insertNoteEntry(noteId: string, data: { title: string; summary: string; keywords: string; aliases: string; entities: string; body: string }): void {
    const rawDb = getDB();
    if (!rawDb) return;
    rawDb
      .prepare(
        `INSERT INTO memory_notes_fts(entry_id, entry_type, note_id, title, summary, keywords, aliases, entities, body)
         VALUES (?, 'note', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(noteId, noteId, data.title, data.summary, data.keywords, data.aliases, data.entities, data.body);
  },

  /** 插入 section 级 FTS 条目 */
  insertSectionEntry(sectionId: string, noteId: string, data: { title: string; summary: string; keywords: string; aliases: string; entities: string; body: string }): void {
    const rawDb = getDB();
    if (!rawDb) return;
    rawDb
      .prepare(
        `INSERT INTO memory_notes_fts(entry_id, entry_type, note_id, title, summary, keywords, aliases, entities, body)
         VALUES (?, 'section', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(sectionId, noteId, data.title, data.summary, data.keywords, data.aliases, data.entities, data.body);
  },

  /** 删除某 note 的所有 FTS 条目（note + 其 sections） */
  deleteByNote(noteId: string): void {
    const rawDb = getDB();
    if (!rawDb) return;
    // contentless FTS5 不支持 DELETE FROM，需要用 rebuild 方式清除指定 note
    // 先收集该 note 的所有条目 rowid，然后用 DROP+CREATE 重建（开销较大），
    // 但由于 contentless 表无法按行删除，这里标记后由 rebuildAll 统一处理
    // 实际对于 contentless FTS5 表，只能 DROP+CREATE 或 使用 'delete-all' 后全量重插
    this._dropAndRecreate(rawDb);
    // 重插除了目标 note 之外的所有条目
    this._reinsertAllExcept(rawDb, noteId);
  },

  /** Drop 并重建 FTS 虚拟表 */
  _dropAndRecreate(rawDb: ReturnType<typeof getDB>): void {
    if (!rawDb) return;
    rawDb.exec('DROP TABLE IF EXISTS memory_notes_fts');
    rawDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_notes_fts USING fts5(
        entry_id,
        entry_type,
        note_id,
        title,
        summary,
        keywords,
        aliases,
        entities,
        body,
        content='',
        tokenize='unicode61 remove_diacritics 2'
      );
    `);
  },

  /** 重新插入除指定 noteId 外的所有 FTS 条目 */
  _reinsertAllExcept(rawDb: ReturnType<typeof getDB>, excludeNoteId: string): void {
    if (!rawDb) return;
    const allNotes = rawDb.prepare('SELECT * FROM memory_notes WHERE deleted_at IS NULL AND id != ?').all(excludeNoteId) as MemoryNoteRow[];

    for (const note of allNotes) {
      const topics = safeJsonParse(note.topics, []);
      const kw = safeJsonParse(note.keywords, []);
      const aliases = safeJsonParse(note.aliases, []);
      const entities = safeJsonParse(note.entities, []);
      const sections = rawDb.prepare('SELECT * FROM memory_sections WHERE note_id = ? ORDER BY section_order').all(note.id) as MemorySectionRow[];
      const { noteBody, sectionBodies } = loadIndexedBodies(rawDb, note, sections);

      this.insertNoteEntry(note.id, {
        title: topics.join(' '),
        summary: note.summary || '',
        keywords: kw.join(' '),
        aliases: aliases.join(' '),
        entities: entities.map((e: any) => e?.name || e).join(' '),
        body: noteBody
      });

      for (const sec of sections) {
        const secKw = safeJsonParse(sec.keywords, []);
        this.insertSectionEntry(sec.id, note.id, {
          title: sec.heading,
          summary: sec.summary || '',
          keywords: secKw.join(' '),
          aliases: '',
          entities: '',
          body: sectionBodies.get(sec.id) || sec.summary || ''
        });
      }
    }
  },

  /** 重建某 note 的 FTS 索引（contentless FTS5 不支持按行删除，需全量重建） */
  rebuildForNote(
    noteId: string,
    noteData: { title: string; summary: string; keywords: string; aliases: string; entities: string; body: string },
    sections: Array<{
      id: string;
      title: string;
      summary: string;
      keywords: string;
      aliases: string;
      entities: string;
      body: string;
    }>
  ): void {
    const rawDb = getDB();
    if (!rawDb) return;
    // contentless FTS5 不支持 DELETE WHERE，需要 DROP + CREATE 后全量重插
    this._dropAndRecreate(rawDb);
    this._reinsertAllExcept(rawDb, noteId); // 重插除目标 note 外的所有现有 notes
    // 插入/覆盖当前 note 的新数据
    rawDb
      .prepare(
        `INSERT INTO memory_notes_fts(entry_id, entry_type, note_id, title, summary, keywords, aliases, entities, body)
           VALUES (?, 'note', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(noteId, noteId, noteData.title, noteData.summary, noteData.keywords, noteData.aliases, noteData.entities, noteData.body);
    const stmt = rawDb.prepare(
      `INSERT INTO memory_notes_fts(entry_id, entry_type, note_id, title, summary, keywords, aliases, entities, body)
         VALUES (?, 'section', ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const sec of sections) {
      stmt.run(sec.id, noteId, sec.title, sec.summary, sec.keywords, sec.aliases, sec.entities, sec.body);
    }
  },

  /** FTS5 全文搜索 */
  search(
    query: string,
    opts: { entryType?: 'note' | 'section'; noteIds?: string[]; limit?: number } = {}
  ): Array<{
    entry_id: string;
    entry_type: string;
    note_id: string;
    rank: number;
  }> {
    const rawDb = getDB();
    if (!rawDb) return [];

    const limit = opts.limit ?? 20;
    let sql = `SELECT entry_id, entry_type, note_id, rank
               FROM memory_notes_fts
               WHERE memory_notes_fts MATCH ?`;
    const params: any[] = [query];

    if (opts.entryType) {
      sql += ` AND entry_type = ?`;
      params.push(opts.entryType);
    }
    if (opts.noteIds?.length) {
      const placeholders = opts.noteIds.map(() => '?').join(',');
      sql += ` AND note_id IN (${placeholders})`;
      params.push(...opts.noteIds);
    }
    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit);

    try {
      return rawDb.prepare(sql).all(...params) as any[];
    } catch (e) {
      console.warn('[MemoryFTS] search failed:', e);
      return [];
    }
  },

  /** 清空所有 FTS 数据（用于全量重建） */
  truncate(): void {
    const rawDb = getDB();
    if (!rawDb) return;
    // contentless FTS5 表不支持 DELETE FROM，需 DROP + CREATE
    this._dropAndRecreate(rawDb);
  },

  /** 重建全部 FTS 索引（从 memory_notes + memory_sections 表重建） */
  async rebuildAll(): Promise<number> {
    const rawDb = getDB();
    if (!rawDb) return 0;
    const db = getOrm();

    // 清空 FTS
    this.truncate();

    // 获取所有未删除的 notes
    const notes = await db.select().from(memory_notes).where(isNull(memory_notes.deletedAt));
    let count = 0;

    for (const note of notes as MemoryNoteRow[]) {
      const topics = safeJsonParse(note.topics, []);
      const keywords = safeJsonParse(note.keywords, []);
      const aliases = safeJsonParse(note.aliases, []);
      const entities = safeJsonParse(note.entities, []);
      const sections = await db.select().from(memory_sections).where(eq(memory_sections.noteId, note.id)).orderBy(memory_sections.sectionOrder);
      const { noteBody, sectionBodies } = loadIndexedBodies(rawDb, note, sections as MemorySectionRow[]);

      this.insertNoteEntry(note.id, {
        title: topics.join(' '),
        summary: note.summary || '',
        keywords: keywords.join(' '),
        aliases: aliases.join(' '),
        entities: entities.map((e: any) => e?.name || e).join(' '),
        body: noteBody
      });

      for (const sec of sections as MemorySectionRow[]) {
        const secKeywords = safeJsonParse(sec.keywords, []);
        this.insertSectionEntry(sec.id, note.id, {
          title: sec.heading,
          summary: sec.summary || '',
          keywords: secKeywords.join(' '),
          aliases: '',
          entities: '',
          body: sectionBodies.get(sec.id) || sec.summary || ''
        });
      }
      count++;
    }
    return count;
  }
};

// ━━ Helper ━━

function safeJsonParse(json: string | null | undefined, fallback: any[] = []): any[] {
  if (!json) return fallback;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function loadIndexedBodies(rawDb: ReturnType<typeof getDB>, note: MemoryNoteRow, sections: MemorySectionRow[]): { noteBody: string; sectionBodies: Map<string, string> } {
  const sectionBodies = new Map<string, string>();

  if (!rawDb || !note.filePath || !note.workspaceId) {
    return { noteBody: note.summary || '', sectionBodies };
  }

  const workspace = rawDb.prepare('SELECT root_path FROM workspaces WHERE id = ? LIMIT 1').get(note.workspaceId) as { root_path?: string } | undefined;
  if (!workspace?.root_path) {
    return { noteBody: note.summary || '', sectionBodies };
  }

  try {
    const absolutePath = path.join(workspace.root_path, note.filePath);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const { bodyStartLine } = parseFrontmatter(content);
    const lines = content.split('\n');
    const noteBody =
      lines
        .slice(Math.max(0, bodyStartLine - 1))
        .join('\n')
        .trim() ||
      note.summary ||
      '';

    for (const sec of sections) {
      const body = readLines(content, sec.lineStart, sec.lineEnd).trim();
      if (body) {
        sectionBodies.set(sec.id, body);
      }
    }

    return { noteBody, sectionBodies };
  } catch {
    return { noteBody: note.summary || '', sectionBodies };
  }
}
