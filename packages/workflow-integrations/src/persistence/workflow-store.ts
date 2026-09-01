import fs from 'node:fs';
import fsp from 'node:fs/promises';

import { normalizeWorkflowDefinition, sanitizeWorkflowRunRecord, type WorkflowDefinition, type WorkflowRunRecord } from '@chobits/workflow';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { getOrm, Schema } from '../../../common/db';

export interface WorkflowRunRetentionPolicy {
  asOf: number;
  batchSize: number;
  maxAgeMs: number;
  maxRunsPerWorkspace: number;
}

// 预设工作流ID集合（从JSON文件加载）
let presetWorkflowIds = new Set<string>();

// 预设工作流缓存
let presetWorkflowsCache: WorkflowDefinition[] | null = null;
let presetWorkflowsCacheTime = 0;
const PRESET_CACHE_TTL = 60000; // 缓存1分钟

export const WorkflowStore = {
  /**
   * 加载预设工作流定义（带缓存）
   */
  async loadPresetWorkflows(definitionsPath: string, forceReload?: boolean): Promise<WorkflowDefinition[]> {
    const now = Date.now();

    // 如果缓存有效且不强制重新加载，直接返回缓存
    if (!forceReload && presetWorkflowsCache !== null && now - presetWorkflowsCacheTime < PRESET_CACHE_TTL) {
      return presetWorkflowsCache;
    }

    try {
      const file = definitionsPath;
      if (!fs.existsSync(file)) {
        console.warn('[WorkflowStore] 预设工作流文件不存在:', file);
        presetWorkflowsCache = [];
        presetWorkflowsCacheTime = now;
        return [];
      }
      const txt = await fsp.readFile(file, 'utf8');
      const workflows = (JSON.parse(txt) as unknown[]).map((workflow) => normalizeWorkflowDefinition(workflow));
      // 为所有预设工作流设置 isPreset 字段
      const workflowsWithPresetFlag = workflows.map((w) => ({ ...w, isPreset: true }));
      // 更新预设工作流ID集合
      presetWorkflowIds = new Set(workflows.map((w) => w.id));
      // 更新缓存
      presetWorkflowsCache = workflowsWithPresetFlag;
      presetWorkflowsCacheTime = now;
      console.log(`[WorkflowStore] 加载了 ${workflows.length} 个预设工作流`);
      return workflowsWithPresetFlag;
    } catch (err) {
      console.error('[WorkflowStore] 加载预设工作流失败:', err);
      presetWorkflowsCache = [];
      presetWorkflowsCacheTime = now;
      return [];
    }
  },

  /**
   * 检查工作流是否为预设工作流
   */
  isPresetWorkflow(id: string): boolean {
    return presetWorkflowIds.has(id);
  },

  // 立即保存（用于应用退出时）- 数据库模式下不需要做任何事，但保留接口兼容
  async flushStore(): Promise<void> {
    // no-op
  },

  async list(workspaceId: string): Promise<WorkflowDefinition[]> {
    const db = getOrm();
    if (!db) return [];

    const rows = await db.select().from(Schema.workflows).where(eq(Schema.workflows.workspaceId, workspaceId)).orderBy(desc(Schema.workflows.updatedAt));

    return rows.map((row: any) => {
      const def = JSON.parse(row.definition);
      return normalizeWorkflowDefinition({
        id: row.id,
        name: row.name,
        schemaVersion: def.schemaVersion,
        workspaceId: row.workspaceId,
        description: row.description,
        icon: def.icon,
        nodes: def.nodes || [],
        edges: def.edges || [],
        options: def.options,
        isPreset: false // 用户自定义工作流不是预设
      });
    });
  },

  async get(id: string, workspaceId: string): Promise<WorkflowDefinition | undefined> {
    const db = getOrm();
    if (!db) return undefined;

    const [row] = await db
      .select()
      .from(Schema.workflows)
      .where(and(eq(Schema.workflows.id, id), eq(Schema.workflows.workspaceId, workspaceId)))
      .limit(1);

    if (!row) return undefined;

    const def = JSON.parse(row.definition);
    return normalizeWorkflowDefinition({
      id: row.id,
      name: row.name,
      schemaVersion: def.schemaVersion,
      workspaceId: row.workspaceId,
      description: row.description,
      icon: def.icon,
      nodes: def.nodes || [],
      edges: def.edges || [],
      options: def.options,
      isPreset: false // 用户自定义工作流不是预设
    });
  },

  async upsert(def: WorkflowDefinition): Promise<void> {
    const normalizedDef = normalizeWorkflowDefinition(def);
    // 不允许保存预设工作流
    if (this.isPresetWorkflow(normalizedDef.id)) {
      throw new Error(`不能修改预设工作流: ${normalizedDef.id}`);
    }

    const db = getOrm();
    if (!db) throw new Error('Database not initialized');
    if (!normalizedDef.workspaceId) throw new Error('workspaceId is required');

    const [existing] = await db.select({ workspaceId: Schema.workflows.workspaceId }).from(Schema.workflows).where(eq(Schema.workflows.id, normalizedDef.id)).limit(1);
    if (existing && existing.workspaceId !== normalizedDef.workspaceId) {
      throw new Error(`Workflow ${normalizedDef.id} belongs to another workspace`);
    }

    const definition = JSON.stringify({
      schemaVersion: normalizedDef.schemaVersion,
      nodes: normalizedDef.nodes,
      edges: normalizedDef.edges,
      options: normalizedDef.options,
      icon: normalizedDef.icon
    });

    const now = Date.now();

    await db
      .insert(Schema.workflows)
      .values({
        id: normalizedDef.id,
        name: normalizedDef.name,
        description: normalizedDef.description,
        definition,
        workspaceId: normalizedDef.workspaceId,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: Schema.workflows.id,
        set: {
          name: normalizedDef.name,
          description: normalizedDef.description,
          definition,
          workspaceId: normalizedDef.workspaceId,
          updatedAt: now
        }
      });
  },

  async remove(id: string, workspaceId: string): Promise<void> {
    // 不允许删除预设工作流
    if (this.isPresetWorkflow(id)) {
      throw new Error(`不能删除预设工作流: ${id}`);
    }

    const db = getOrm();
    if (!db) return;

    await db.delete(Schema.workflowRuns).where(and(eq(Schema.workflowRuns.workflowId, id), eq(Schema.workflowRuns.workspaceId, workspaceId)));
    await db.delete(Schema.workflows).where(and(eq(Schema.workflows.id, id), eq(Schema.workflows.workspaceId, workspaceId)));
  },

  async addRun(rec: WorkflowRunRecord): Promise<void> {
    const db = getOrm();
    if (!db) return;
    const record = sanitizeWorkflowRunRecord(rec);

    await db.insert(Schema.workflowRuns).values({
      id: record.runId,
      workflowId: record.workflowId,
      workspaceId: record.workspaceId ?? record.metadata?.workspaceId ?? null,
      status: record.status,
      input: record.input ? JSON.stringify(record.input) : null,
      output: record.output ? JSON.stringify(record.output) : null,
      error: record.error ? (typeof record.error === 'string' ? record.error : JSON.stringify(record.error)) : null,
      nodes: record.nodes ? JSON.stringify(record.nodes) : null,
      metadata: record.metadata ? JSON.stringify(record.metadata) : null,
      duration: record.duration,
      startedAt: record.startedAt,
      completedAt: record.completedAt
    });
  },

  async updateRun(rec: WorkflowRunRecord): Promise<void> {
    const db = getOrm();
    if (!db) return;
    const record = sanitizeWorkflowRunRecord(rec);

    await db
      .insert(Schema.workflowRuns)
      .values({
        id: record.runId,
        workflowId: record.workflowId,
        workspaceId: record.workspaceId ?? record.metadata?.workspaceId ?? null,
        status: record.status,
        input: record.input ? JSON.stringify(record.input) : null,
        output: record.output ? JSON.stringify(record.output) : null,
        error: record.error ? (typeof record.error === 'string' ? record.error : JSON.stringify(record.error)) : null,
        nodes: record.nodes ? JSON.stringify(record.nodes) : null,
        metadata: record.metadata ? JSON.stringify(record.metadata) : null,
        duration: record.duration,
        startedAt: record.startedAt,
        completedAt: record.completedAt
      })
      .onConflictDoUpdate({
        target: Schema.workflowRuns.id,
        set: {
          status: record.status,
          workspaceId: record.workspaceId ?? record.metadata?.workspaceId ?? null,
          input: record.input ? JSON.stringify(record.input) : null,
          output: record.output ? JSON.stringify(record.output) : null,
          error: record.error ? (typeof record.error === 'string' ? record.error : JSON.stringify(record.error)) : null,
          nodes: record.nodes ? JSON.stringify(record.nodes) : null,
          metadata: record.metadata ? JSON.stringify(record.metadata) : null,
          duration: record.duration,
          completedAt: record.completedAt
        }
      });
  },

  async listRuns(workspaceId: string, workflowId?: string, limit = 100, resourceId?: string): Promise<WorkflowRunRecord[]> {
    const db = getOrm();
    if (!db) return [];
    const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 100;

    // 构建查询条件
    const conditions = [eq(Schema.workflowRuns.workspaceId, workspaceId)];
    if (workflowId) {
      conditions.push(eq(Schema.workflowRuns.workflowId, workflowId));
    }
    if (resourceId) {
      conditions.push(sql`json_valid(${Schema.workflowRuns.metadata}) AND json_extract(${Schema.workflowRuns.metadata}, '$.resourceId') = ${resourceId}`);
    }

    let query = db.select().from(Schema.workflowRuns);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(Schema.workflowRuns.startedAt)).limit(normalizedLimit);

    const rows = await query;

    return rows.map((row: any) => ({
      runId: row.id,
      workflowId: row.workflowId,
      workspaceId: row.workspaceId,
      status: row.status as any,
      createdAt: row.startedAt,
      input: undefined,
      output: undefined,
      error: row.error,
      nodes: {},
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      duration: row.duration,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  },

  async getRun(runId: string, workspaceId: string): Promise<WorkflowRunRecord | undefined> {
    const db = getOrm();
    if (!db) return undefined;

    const [row] = await db
      .select()
      .from(Schema.workflowRuns)
      .where(and(eq(Schema.workflowRuns.id, runId), eq(Schema.workflowRuns.workspaceId, workspaceId)))
      .limit(1);

    if (!row) return undefined;

    return {
      runId: row.id,
      workflowId: row.workflowId,
      workspaceId: row.workspaceId,
      status: row.status as any,
      createdAt: row.startedAt,
      input: row.input ? JSON.parse(row.input) : undefined,
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error,
      nodes: row.nodes ? JSON.parse(row.nodes) : {},
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      duration: row.duration,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  },

  async removeRun(runId: string, workspaceId: string): Promise<void> {
    const db = getOrm();
    if (!db) return;

    await db.delete(Schema.workflowRuns).where(and(eq(Schema.workflowRuns.id, runId), eq(Schema.workflowRuns.workspaceId, workspaceId)));
  },

  async pruneRuns(workspaceId: string, policy: WorkflowRunRetentionPolicy): Promise<number> {
    const db = getOrm();
    if (!db) return 0;

    const batchSize = Math.max(1, Math.trunc(policy.batchSize));
    const maxRunsPerWorkspace = Math.max(1, Math.trunc(policy.maxRunsPerWorkspace));
    const cutoff = policy.asOf - Math.max(1, Math.trunc(policy.maxAgeMs));
    const terminalRunCondition = and(eq(Schema.workflowRuns.workspaceId, workspaceId), inArray(Schema.workflowRuns.status, ['completed', 'failed', 'canceled']));
    let deleted = 0;

    const deleteRows = async (rows: Array<{ id: string }>): Promise<number> => {
      if (rows.length === 0) return 0;
      await db.delete(Schema.workflowRuns).where(
        inArray(
          Schema.workflowRuns.id,
          rows.map((row) => row.id)
        )
      );
      return rows.length;
    };

    while (true) {
      const expired = await db
        .select({ id: Schema.workflowRuns.id })
        .from(Schema.workflowRuns)
        .where(and(terminalRunCondition, or(isNull(Schema.workflowRuns.startedAt), lt(Schema.workflowRuns.startedAt, cutoff))))
        .limit(batchSize);
      const removed = await deleteRows(expired);
      deleted += removed;
      if (removed < batchSize) break;
    }

    while (true) {
      const overflow = await db
        .select({ id: Schema.workflowRuns.id })
        .from(Schema.workflowRuns)
        .where(terminalRunCondition)
        .orderBy(desc(Schema.workflowRuns.startedAt))
        .limit(batchSize)
        .offset(maxRunsPerWorkspace);
      const removed = await deleteRows(overflow);
      deleted += removed;
      if (removed < batchSize) break;
    }

    return deleted;
  }
};
