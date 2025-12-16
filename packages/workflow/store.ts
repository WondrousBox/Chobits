import fs from 'node:fs';
import fsp from 'node:fs/promises';

import { and, desc, eq } from 'drizzle-orm';

import { getOrm, Schema } from './../common/db';
import type { WorkflowDefinition, WorkflowRunRecord } from './types';

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
      const workflows = JSON.parse(txt) as WorkflowDefinition[];
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

  async list(): Promise<WorkflowDefinition[]> {
    const db = getOrm();
    if (!db) return [];

    const rows = await db.select().from(Schema.workflows).orderBy(desc(Schema.workflows.updatedAt));

    return rows.map((row: any) => {
      const def = JSON.parse(row.definition);
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        icon: def.icon,
        nodes: def.nodes || [],
        edges: def.edges || [],
        options: def.options,
        isPreset: false // 用户自定义工作流不是预设
        // 如果 WorkflowDefinition 类型将来支持 workspaceId，可以在这里添加
        // workspaceId: row.workspaceId
      };
    });
  },

  async get(id: string): Promise<WorkflowDefinition | undefined> {
    const db = getOrm();
    if (!db) return undefined;

    const [row] = await db.select().from(Schema.workflows).where(eq(Schema.workflows.id, id)).limit(1);

    if (!row) return undefined;

    const def = JSON.parse(row.definition);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      icon: def.icon,
      nodes: def.nodes || [],
      edges: def.edges || [],
      options: def.options,
      isPreset: false // 用户自定义工作流不是预设
    };
  },

  async upsert(def: WorkflowDefinition): Promise<void> {
    // 不允许保存预设工作流
    if (this.isPresetWorkflow(def.id)) {
      throw new Error(`不能修改预设工作流: ${def.id}`);
    }

    const db = getOrm();
    if (!db) throw new Error('Database not initialized');

    const definition = JSON.stringify({
      nodes: def.nodes,
      edges: def.edges,
      options: def.options,
      icon: def.icon
    });

    const now = Date.now();

    await db
      .insert(Schema.workflows)
      .values({
        id: def.id,
        name: def.name,
        description: def.description,
        definition,
        updatedAt: now
        // 注意：这里没有传入 workspaceId，如果 WorkflowDefinition 中没有 workspaceId，
        // 那么新创建的工作流 workspaceId 将为 null。
      })
      .onConflictDoUpdate({
        target: Schema.workflows.id,
        set: {
          name: def.name,
          description: def.description,
          definition,
          updatedAt: now
        }
      });
  },

  async remove(id: string): Promise<void> {
    // 不允许删除预设工作流
    if (this.isPresetWorkflow(id)) {
      throw new Error(`不能删除预设工作流: ${id}`);
    }

    const db = getOrm();
    if (!db) return;

    await db.delete(Schema.workflows).where(eq(Schema.workflows.id, id));
  },

  async addRun(rec: WorkflowRunRecord): Promise<void> {
    const db = getOrm();
    if (!db) return;

    await db.insert(Schema.workflowRuns).values({
      id: rec.runId,
      workflowId: rec.workflowId,
      status: rec.status,
      input: rec.input ? JSON.stringify(rec.input) : null,
      output: rec.output ? JSON.stringify(rec.output) : null,
      error: rec.error ? (typeof rec.error === 'string' ? rec.error : JSON.stringify(rec.error)) : null,
      nodes: rec.nodes ? JSON.stringify(rec.nodes) : null,
      metadata: rec.metadata ? JSON.stringify(rec.metadata) : null,
      duration: rec.duration,
      startedAt: rec.startedAt,
      completedAt: rec.completedAt
    });
  },

  async updateRun(rec: WorkflowRunRecord): Promise<void> {
    const db = getOrm();
    if (!db) return;

    await db
      .insert(Schema.workflowRuns)
      .values({
        id: rec.runId,
        workflowId: rec.workflowId,
        status: rec.status,
        input: rec.input ? JSON.stringify(rec.input) : null,
        output: rec.output ? JSON.stringify(rec.output) : null,
        error: rec.error ? (typeof rec.error === 'string' ? rec.error : JSON.stringify(rec.error)) : null,
        nodes: rec.nodes ? JSON.stringify(rec.nodes) : null,
        metadata: rec.metadata ? JSON.stringify(rec.metadata) : null,
        duration: rec.duration,
        startedAt: rec.startedAt,
        completedAt: rec.completedAt
      })
      .onConflictDoUpdate({
        target: Schema.workflowRuns.id,
        set: {
          status: rec.status,
          input: rec.input ? JSON.stringify(rec.input) : null,
          output: rec.output ? JSON.stringify(rec.output) : null,
          error: rec.error ? (typeof rec.error === 'string' ? rec.error : JSON.stringify(rec.error)) : null,
          nodes: rec.nodes ? JSON.stringify(rec.nodes) : null,
          metadata: rec.metadata ? JSON.stringify(rec.metadata) : null,
          duration: rec.duration,
          completedAt: rec.completedAt
        }
      });
  },

  async listRuns(workflowId?: string, limit = 100, resourceId?: string, workspaceId?: string): Promise<WorkflowRunRecord[]> {
    const db = getOrm();
    if (!db) return [];

    // 构建查询条件
    const conditions = [];
    if (workflowId) {
      conditions.push(eq(Schema.workflowRuns.workflowId, workflowId));
    }

    let query = db.select().from(Schema.workflowRuns);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // 多取一些以供内存过滤
    query = query.orderBy(desc(Schema.workflowRuns.startedAt)).limit(limit * 5);

    const rows = await query;

    let results = rows.map((row: any) => ({
      runId: row.id,
      workflowId: row.workflowId,
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

    if (resourceId) {
      results = results.filter((r: any) => r.metadata?.resourceId === resourceId);
    }

    if (workspaceId) {
      results = results.filter((r: any) => r.metadata?.workspaceId === workspaceId);
    }

    return results.slice(0, limit);
  },

  async getRun(runId: string): Promise<WorkflowRunRecord | undefined> {
    const db = getOrm();
    if (!db) return undefined;

    const [row] = await db.select().from(Schema.workflowRuns).where(eq(Schema.workflowRuns.id, runId)).limit(1);

    if (!row) return undefined;

    return {
      runId: row.id,
      workflowId: row.workflowId,
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async removeRun(runId: string, workspaceId?: string): Promise<void> {
    const db = getOrm();
    if (!db) return;

    await db.delete(Schema.workflowRuns).where(eq(Schema.workflowRuns.id, runId));
  }
};
