import { randomUUID } from 'node:crypto';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';

import { planWorkflowDag } from './core/dag-planner';
import { EngineEmitter } from './core/events';
import { executeWorkflowSchedule } from './core/execution-scheduler';
import { getNode, getPlugin } from './core/registry';
import {
  applyTerminalWorkflowOutput,
  cancelWorkflowRun,
  collectTerminalWorkflowOutput,
  createWorkflowRunRecord,
  finalizeWorkflowRunStatus,
  finishWorkflowRun,
  setWorkflowRunStatus,
  skipWorkflowNodes,
  transitionWorkflowNode,
  updateWorkflowNode
} from './core/run-state-machine';
import { MAX_WORKFLOW_LOG_ENTRIES, MAX_WORKFLOW_LOG_MESSAGE_LENGTH, sanitizeWorkflowString, sanitizeWorkflowValue } from './sanitize';
import { parseWorkflowDefinition } from './schema';
import type { ExecutionContext, PortSchema, ValidateResult, ValueType, WorkflowDefinition, WorkflowRunLogEntry, WorkflowRunLogLevel, WorkflowRunRecord, WorkflowValidationIssue } from './types';

const WORKFLOW_TMP_ROOT = path.join(os.tmpdir(), 'workflow');
const DEFAULT_COMPLETED_RUN_TEMP_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_CACHED_RUNS = 100;

function now(): number {
  return Date.now();
}

export type WorkflowEngineOptions = {
  completedRunTempTtlMs?: number;
  maxCachedRuns?: number;
};

export type WorkflowEngineRunHandle = {
  runId: string;
  completionPromise: Promise<WorkflowRunRecord>;
};

async function cleanupExpiredWorkflowTempDirs(retentionMs: number, protectedDirs: Set<string>): Promise<void> {
  const entries = await fsPromises.readdir(WORKFLOW_TMP_ROOT, { withFileTypes: true }).catch(() => []);
  const cutoff = now() - retentionMs;
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) return;
      const directory = path.join(WORKFLOW_TMP_ROOT, entry.name);
      if (protectedDirs.has(directory)) return;
      const stat = await fsPromises.stat(directory).catch(() => undefined);
      if (stat && stat.mtimeMs <= cutoff) {
        await fsPromises.rm(directory, { recursive: true, force: true }).catch(() => {});
      }
    })
  );
}

function mergeInputValues(def: WorkflowDefinition, nodeId: string, nodeOutputMap: Map<string, Record<string, any>>): Record<string, any> {
  const input: Record<string, any> = {};
  // edges connected to this node's inputs
  for (const e of def.edges) {
    if (e.to.nodeId !== nodeId) continue;
    const fromMap = nodeOutputMap.get(e.from.nodeId) || {};
    if (e.from.port in fromMap) input[e.to.port] = fromMap[e.from.port];
  }
  return input;
}

function portTypes(type: ValueType | ValueType[]): ValueType[] {
  return Array.isArray(type) ? type : [type];
}

function portTypesCompatible(source: PortSchema, target: PortSchema): boolean {
  const sourceTypes = portTypes(source.type);
  const targetTypes = portTypes(target.type);
  return sourceTypes.includes('any') || targetTypes.includes('any') || sourceTypes.some((type) => targetTypes.includes(type));
}

function valueMatchesType(value: unknown, type: ValueType | ValueType[]): boolean {
  const types = portTypes(type);
  if (types.includes('any')) return true;
  return types.some((candidate) => {
    switch (candidate) {
      case 'string':
      case 'file':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
      case 'resource':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return false;
    }
  });
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function validateNodePorts(nodeId: string, nodeIndex: number, direction: 'inputs' | 'outputs', ports: PortSchema[], issues: WorkflowValidationIssue[]): void {
  const keys = new Set<string>();
  ports.forEach((port, portIndex) => {
    if (typeof port.key !== 'string' || !port.key.trim()) {
      issues.push({
        code: 'invalid-node-port',
        message: `Node ${nodeId} has an invalid ${direction} port key`,
        path: ['nodes', nodeIndex, 'config', direction, portIndex, 'key'],
        nodeId
      });
      return;
    }
    if (keys.has(port.key)) {
      issues.push({
        code: 'invalid-node-port',
        message: `Node ${nodeId} has a duplicate ${direction} port key: ${port.key}`,
        path: ['nodes', nodeIndex, 'config', direction, portIndex, 'key'],
        nodeId
      });
      return;
    }
    keys.add(port.key);
  });
}

function issuesResult(issues: WorkflowValidationIssue[]): ValidateResult {
  return {
    ok: false,
    issues,
    errors: issues.map((issue) => issue.message)
  };
}

export type WorkflowValidationOptions = {
  checkRuntimeDependencies?: boolean;
};

export class WorkflowEngine extends EngineEmitter {
  private runs = new Map<string, WorkflowRunRecord>();
  private runLogs = new Map<string, WorkflowRunLogEntry[]>();
  // 存储每个运行的工作流的执行上下文
  private runContexts = new Map<string, ExecutionContext>();
  private abortControllers = new Map<string, AbortController>();
  private readonly completedRunTempTtlMs: number;
  private readonly maxCachedRuns: number;

  constructor(
    private baseCtx: Omit<ExecutionContext, 'tmpDir'>,
    options: WorkflowEngineOptions = {}
  ) {
    super();
    this.completedRunTempTtlMs = Math.max(0, options.completedRunTempTtlMs ?? DEFAULT_COMPLETED_RUN_TEMP_TTL_MS);
    this.maxCachedRuns = Math.max(1, Math.floor(options.maxCachedRuns ?? DEFAULT_MAX_CACHED_RUNS));
    void this.cleanupExpiredTempDirs();
  }

  private cleanupExpiredTempDirs(): Promise<void> {
    if (this.completedRunTempTtlMs === 0) return Promise.resolve();
    const protectedDirs = new Set([...this.runContexts.values()].map((context) => context.tmpDir));
    return cleanupExpiredWorkflowTempDirs(this.completedRunTempTtlMs, protectedDirs);
  }

  private pruneRunCache(protectedRunId: string): void {
    if (this.runs.size <= this.maxCachedRuns) return;
    for (const [runId, record] of this.runs) {
      if (this.runs.size <= this.maxCachedRuns) break;
      if (runId === protectedRunId || record.status === 'queued' || record.status === 'running') continue;
      this.runs.delete(runId);
      this.runLogs.delete(runId);
    }
  }

  private log(runId: string, level: WorkflowRunLogLevel, nodeId: string | undefined, ...args: any[]): void {
    // const printer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    // printer(...args);
    const message = sanitizeWorkflowString(
      args
        .map((arg) => {
          if (typeof arg === 'string') return sanitizeWorkflowString(arg, MAX_WORKFLOW_LOG_MESSAGE_LENGTH);
          return util.inspect(sanitizeWorkflowValue(arg, { maxDepth: 6, maxTotalChars: MAX_WORKFLOW_LOG_MESSAGE_LENGTH }), {
            depth: 6,
            colors: false,
            compact: false
          });
        })
        .join(' '),
      MAX_WORKFLOW_LOG_MESSAGE_LENGTH
    );
    const entry: WorkflowRunLogEntry = {
      runId,
      level,
      message,
      nodeId,
      ...(nodeId && this.runs.get(runId)?.nodes[nodeId]?.attempt ? { attempt: this.runs.get(runId)?.nodes[nodeId]?.attempt } : {}),
      ...(nodeId && this.runs.get(runId)?.nodes[nodeId]?.errorReason ? { errorReason: this.runs.get(runId)?.nodes[nodeId]?.errorReason } : {}),
      timestamp: now()
    };
    const existing = this.runLogs.get(runId);
    if (existing) {
      existing.push(entry);
      if (existing.length > MAX_WORKFLOW_LOG_ENTRIES) {
        existing.splice(0, existing.length - MAX_WORKFLOW_LOG_ENTRIES);
      }
    } else {
      this.runLogs.set(runId, [entry]);
    }
    this.emitTyped('run:log', runId, entry);
  }

  buildCtx(): ExecutionContext {
    const tmpDir = path.join(WORKFLOW_TMP_ROOT, randomUUID());
    console.log('buildCtx', tmpDir);

    const ctx: ExecutionContext = {
      ...this.baseCtx,
      tmpDir
    };

    // 包装 getResourceProjectDirs，自动传入上下文中的 resourceId 和 workspaceId
    if (this.baseCtx.getResourceProjectDirs) {
      const originalFn = this.baseCtx.getResourceProjectDirs;
      ctx.getResourceProjectDirs = (taskType: string) => {
        return originalFn(taskType, {
          resourceId: ctx.resourceId,
          workspaceId: ctx.workspaceId,
          folderId: ctx.folderId
        });
      };
    }

    return ctx;
  }

  async validate(value: WorkflowDefinition, options: WorkflowValidationOptions = {}): Promise<ValidateResult> {
    const parsed = parseWorkflowDefinition(value);
    if (!parsed.ok) return issuesResult(parsed.issues);

    const def = parsed.definition;
    const issues: WorkflowValidationIssue[] = [];
    const missingPlugins: { id: string; hint?: string }[] = [];
    const nodeById = new Map<string, (typeof def.nodes)[number]>();
    const nodeIndexById = new Map<string, number>();
    const edgeIds = new Set<string>();
    const duplicateNodeIds = new Set<string>();

    def.nodes.forEach((node, index) => {
      if (nodeById.has(node.id)) {
        duplicateNodeIds.add(node.id);
        issues.push({
          code: 'duplicate-node-id',
          message: `Duplicate node id: ${node.id}`,
          path: ['nodes', index, 'id'],
          nodeId: node.id
        });
        return;
      }
      nodeById.set(node.id, node);
      nodeIndexById.set(node.id, index);
    });

    def.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) {
        issues.push({
          code: 'duplicate-edge-id',
          message: `Duplicate edge id: ${edge.id}`,
          path: ['edges', index, 'id'],
          edgeId: edge.id
        });
      }
      edgeIds.add(edge.id);
    });

    type ResolvedPorts = { inputs: PortSchema[]; outputs: PortSchema[] };
    const portsByNodeId = new Map<string, ResolvedPorts>();
    for (const [nodeId, node] of nodeById) {
      const handler = getNode(node.type);
      if (!handler) {
        const nodeIndex = nodeIndexById.get(nodeId) ?? 0;
        issues.push({
          code: 'invalid-definition',
          message: `Unknown node type: ${node.type} in node ${node.id}`,
          path: ['nodes', nodeIndex, 'type'],
          nodeId
        });
        continue;
      }

      try {
        const inputs = handler.getInputs ? handler.getInputs(node.config) : handler.spec.inputs || [];
        const outputs = handler.getOutputs ? handler.getOutputs(node.config) : handler.spec.outputs || [];
        const nodeIndex = nodeIndexById.get(nodeId) ?? 0;
        validateNodePorts(nodeId, nodeIndex, 'inputs', inputs, issues);
        validateNodePorts(nodeId, nodeIndex, 'outputs', outputs, issues);
        portsByNodeId.set(nodeId, { inputs, outputs });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push({
          code: 'invalid-node-config',
          message: `Node ${node.id} dynamic ports are invalid: ${message}`,
          path: ['nodes', nodeIndexById.get(nodeId) ?? 0, 'config'],
          nodeId
        });
      }

      try {
        handler.validateConfig?.(node.config);
        // Dynamic config may depend on provider state. Structural validation only
        // checks the stable schema; runtime readiness is handled separately.
        const configSchema = handler.spec.config || [];
        for (const field of configSchema || []) {
          const fieldValue = node.config?.[field.key];
          if (hasValue(fieldValue) && !valueMatchesType(fieldValue, field.type)) {
            issues.push({
              code: 'invalid-node-config',
              message: `Node ${node.id} config ${field.key} has an invalid value type`,
              path: ['nodes', nodeIndexById.get(nodeId) ?? 0, 'config', field.key],
              nodeId
            });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push({
          code: 'invalid-node-config',
          message: `Node ${node.id} config is invalid: ${message}`,
          path: ['nodes', nodeIndexById.get(nodeId) ?? 0, 'config'],
          nodeId
        });
      }
    }

    const incomingByPort = new Map<string, number[]>();
    def.edges.forEach((edge, edgeIndex) => {
      const from = nodeById.get(edge.from.nodeId);
      const to = nodeById.get(edge.to.nodeId);
      if (!from || !to || duplicateNodeIds.has(edge.from.nodeId) || duplicateNodeIds.has(edge.to.nodeId)) {
        issues.push({
          code: 'invalid-edge-node',
          message: `Invalid edge ${edge.id}: node not found or ambiguous`,
          path: ['edges', edgeIndex],
          edgeId: edge.id
        });
        return;
      }

      const fromPort = portsByNodeId.get(from.id)?.outputs.find((port) => port.key === edge.from.port);
      const toPort = portsByNodeId.get(to.id)?.inputs.find((port) => port.key === edge.to.port);
      if (!fromPort) {
        issues.push({
          code: 'invalid-output-port',
          message: `Edge ${edge.id}: output port not found: ${edge.from.nodeId}.${edge.from.port}`,
          path: ['edges', edgeIndex, 'from', 'port'],
          nodeId: from.id,
          edgeId: edge.id
        });
      }
      if (!toPort) {
        issues.push({
          code: 'invalid-input-port',
          message: `Edge ${edge.id}: input port not found: ${edge.to.nodeId}.${edge.to.port}`,
          path: ['edges', edgeIndex, 'to', 'port'],
          nodeId: to.id,
          edgeId: edge.id
        });
      }
      if (fromPort && toPort && !portTypesCompatible(fromPort, toPort)) {
        issues.push({
          code: 'incompatible-port-types',
          message: `Edge ${edge.id}: incompatible port types ${JSON.stringify(fromPort.type)} -> ${JSON.stringify(toPort.type)}`,
          path: ['edges', edgeIndex],
          edgeId: edge.id
        });
      }

      const targetKey = `${edge.to.nodeId}\u0000${edge.to.port}`;
      const incoming = incomingByPort.get(targetKey) || [];
      incoming.push(edgeIndex);
      incomingByPort.set(targetKey, incoming);
    });

    for (const [targetKey, edgeIndexes] of incomingByPort) {
      if (edgeIndexes.length < 2) continue;
      const separator = targetKey.indexOf('\u0000');
      const nodeId = targetKey.slice(0, separator);
      const port = targetKey.slice(separator + 1);
      for (const edgeIndex of edgeIndexes.slice(1)) {
        const edge = def.edges[edgeIndex];
        issues.push({
          code: 'duplicate-input-connection',
          message: `Input port ${nodeId}.${port} has multiple connections; explicit fan-in is not supported`,
          path: ['edges', edgeIndex, 'to'],
          nodeId,
          edgeId: edge.id
        });
      }
    }

    for (const [nodeId, node] of nodeById) {
      const ports = portsByNodeId.get(nodeId);
      if (!ports) continue;
      for (const port of ports.inputs) {
        const inlineValue = node.inputDefaults?.[port.key];
        if (hasValue(inlineValue) && !valueMatchesType(inlineValue, port.type)) {
          issues.push({
            code: 'invalid-input-default',
            message: `Node ${nodeId} input default ${port.key} has an invalid value type`,
            path: ['nodes', nodeIndexById.get(nodeId) ?? 0, 'inputDefaults', port.key],
            nodeId
          });
        }
        if (!port.required) continue;
        const connected = incomingByPort.has(`${nodeId}\u0000${port.key}`);
        if (!connected && !hasValue(inlineValue) && !hasValue(port.default)) {
          issues.push({
            code: 'missing-required-input',
            message: `Node ${nodeId} is missing required input: ${port.key}`,
            path: ['nodes', nodeIndexById.get(nodeId) ?? 0, 'inputDefaults', port.key],
            nodeId
          });
        }
      }
    }

    if (!duplicateNodeIds.size && !issues.some((issue) => issue.code === 'invalid-edge-node')) {
      try {
        planWorkflowDag(def);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push({ code: 'invalid-graph', message, path: ['edges'] });
      }
    }

    if (issues.length > 0 || options.checkRuntimeDependencies === false) {
      return issues.length > 0 ? issuesResult(issues) : { ok: true };
    }

    // plugins
    const ctx = this.buildCtx();
    const reqs = new Set<string>();
    for (const n of def.nodes) {
      const h = getNode(n.type);
      h?.spec.requires?.forEach((r) => reqs.add(r));
    }
    for (const id of reqs) {
      const p = getPlugin(id);
      if (!p) {
        issues.push({ code: 'invalid-definition', message: `Required plugin not registered: ${id}`, path: ['nodes'] });
        continue;
      }
      const ok = await p.isInstalled(ctx).catch(() => false);
      if (!ok) missingPlugins.push({ id, hint: p.installHint });
    }
    // models - check through plugins
    const missingModels: { pluginId: string; modelName: string; resourceId?: string; displayName?: string }[] = [];
    for (const n of def.nodes) {
      const handler = getNode(n.type);
      if (!handler) continue;

      // 检查节点所需的插件
      const requiredPlugins = handler.spec.requires || [];
      for (const pluginId of requiredPlugins) {
        const plugin = getPlugin(pluginId);
        if (!plugin) continue;

        // 如果插件支持模型检查，调用其检查方法
        if (plugin.checkRequiredModels) {
          try {
            const models = await plugin.checkRequiredModels(ctx, n.config || {});
            if (models && models.length > 0) {
              missingModels.push(...models);
            }
          } catch (err) {
            // 如果检查失败，记录错误但不阻止验证
            console.warn(`[WorkflowEngine] Failed to check models for plugin ${pluginId}:`, err);
          }
        }
      }
    }
    return {
      ok: issues.length === 0 && missingPlugins.length === 0 && missingModels.length === 0,
      issues: issues.length ? issues : undefined,
      errors: issues.length ? issues.map((issue) => issue.message) : undefined,
      missingPlugins: missingPlugins.length ? missingPlugins : undefined,
      missingModels: missingModels.length ? missingModels : undefined
    };
  }

  /**
   * 检查工作流中所有节点是否缺少必填配置（包括开始节点的输入）
   * @param def 工作流定义
   * @param input 当前提供的输入 (可能包含配置覆盖)
   * @returns 缺失的配置项列表
   */
  async checkMissingConfigs(
    def: WorkflowDefinition,
    input: Record<string, any> = {}
  ): Promise<{ nodeId: string; nodeLabel: string; nodeType: string; missingFields: PortSchema[]; currentConfig: Record<string, any>; icon?: string; backgroundColor?: string }[]> {
    const missingConfigs: { nodeId: string; nodeLabel: string; nodeType: string; missingFields: PortSchema[]; currentConfig: Record<string, any>; icon?: string; backgroundColor?: string }[] = [];
    for (const node of def.nodes) {
      const handler = getNode(node.type);
      if (!handler) continue;

      const missingFields: PortSchema[] = [];
      const overrides = input.__configOverrides__?.[node.id] || {};
      const effectiveConfig = { ...node.config, ...overrides };

      // 1. 特殊处理 Start 节点
      if (node.type === 'core/start') {
        const inputMode = (effectiveConfig.inputMode as string) || 'resource';
        // Start 节点的输入可能在 input 根对象中，也可能在 inputDefaults 中
        const effectiveInput = { ...(node.inputDefaults || {}), ...input };

        if (inputMode === 'text' && !effectiveInput.text) {
          missingFields.push({ key: 'text', label: '文本内容', type: 'string', inputType: 'textarea', required: true });
        } else if (inputMode === 'url' && !effectiveInput.url) {
          missingFields.push({ key: 'url', label: '链接地址', type: 'string', inputType: 'text', required: true });
        } else if (inputMode === 'file' && !effectiveInput.file) {
          missingFields.push({ key: 'file', label: '文件路径', type: 'string', inputType: 'file' as any, required: true });
        } else if (inputMode === 'folder' && !effectiveInput.folderId) {
          missingFields.push({ key: 'folderId', label: '选择文件夹', type: 'string', inputType: 'folder' as any, required: true });
        }
      }

      // 2. 处理常规配置检查
      // 获取节点的配置 schema
      let configSchema: PortSchema[] = handler.spec.config || [];

      // 如果节点支持动态配置，获取动态 schema
      if ('getConfig' in handler && typeof handler.getConfig === 'function') {
        try {
          const dynamicConfig = await handler.getConfig(effectiveConfig);
          if (dynamicConfig) {
            configSchema = dynamicConfig;
          }
        } catch (e) {
          console.warn(`Failed to get dynamic config for node ${node.id}`, e);
        }
      }

      for (const field of configSchema) {
        if (field.required) {
          const value = effectiveConfig[field.key];
          // 检查值是否为空 (undefined, null, or empty string)
          const isEmpty = value === undefined || value === null || value === '';

          if (isEmpty) {
            // 检查是否有默认值
            if (field.default !== undefined && field.default !== null && field.default !== '') {
              continue;
            }
            missingFields.push(field);
          }
        }
      }

      if (missingFields.length > 0) {
        missingConfigs.push({
          nodeId: node.id,
          nodeLabel: node.name || handler.spec.label,
          nodeType: node.type,
          missingFields,
          currentConfig: effectiveConfig,
          icon: handler.spec.icon,
          backgroundColor: handler.spec.backgroundColor
        });
      }
    }

    return missingConfigs;
  }

  getRun(runId: string): WorkflowRunRecord | undefined {
    return this.runs.get(runId);
  }

  getRunLogs(runId: string): WorkflowRunLogEntry[] {
    return [...(this.runLogs.get(runId) || [])];
  }

  // 获取运行中的工作流的执行上下文
  getRunContext(runId: string): ExecutionContext | undefined {
    return this.runContexts.get(runId);
  }

  // 更新运行中的工作流的执行上下文
  updateRunContext(runId: string, updates: Partial<ExecutionContext>): void {
    const ctx = this.runContexts.get(runId);
    if (ctx) {
      Object.assign(ctx, updates);
      this.runContexts.set(runId, ctx);
    }
  }

  async cancel(runId: string): Promise<void> {
    const r = this.runs.get(runId);
    if (!r || (r.status !== 'queued' && r.status !== 'running')) return;

    this.abortControllers.get(runId)?.abort();
    for (const state of cancelWorkflowRun(r, now())) {
      this.log(runId, 'warn', state.nodeId, `[WorkflowEngine] 节点 ${state.nodeId} 已取消`);
      this.emitTyped('node:status', r, state);
    }
    this.emitTyped('run:status', r);
  }

  start(def: WorkflowDefinition, initialInput: Record<string, any> = {}, metadata?: Record<string, any>): WorkflowEngineRunHandle {
    const runId = randomUUID();
    return {
      runId,
      completionPromise: this.run(def, initialInput, metadata, runId)
    };
  }

  async run(def: WorkflowDefinition, initialInput: Record<string, any> = {}, metadata?: Record<string, any>, runId = randomUUID()): Promise<WorkflowRunRecord> {
    if (this.runs.has(runId)) throw new Error(`Workflow run already exists: ${runId}`);
    const rec = createWorkflowRunRecord({ definition: def, runId, input: initialInput, metadata, createdAt: now(), startedAt: now() });
    const nodesState = rec.nodes;
    this.runs.set(runId, rec);
    this.emitTyped('run:status', rec);

    const abortController = new AbortController();
    this.abortControllers.set(runId, abortController);

    this.log(
      runId,
      'info',
      undefined,
      `
====== [WorkflowEngine] ========================================================
开始执行: ${def.name} (${def.id})
runId: ${runId}
================================================================================`
    );
    if (Object.keys(initialInput || {}).length > 0) {
      this.log(runId, 'info', undefined, `[WorkflowEngine] 初始输入:`, initialInput);
    }

    const ctx = this.buildCtx();
    ctx.signal = abortController.signal;
    ctx.workflowId = def.id;
    ctx.workflowName = def.name;
    ctx.workflowRunId = runId;

    // 从 metadata 或 initialInput 中提取工作空间和文件夹信息
    // metadata 中可能有 workspaceId 和 folderId
    if (metadata?.workspaceId) {
      ctx.workspaceId = metadata.workspaceId;
    }
    if (metadata?.folderId) {
      ctx.folderId = metadata.folderId;
    }
    // 从 initialInput 中的 resource 对象获取工作空间、文件夹和资源ID信息
    if (initialInput?.resource) {
      const resource = initialInput.resource;
      if (resource.workspaceId && !ctx.workspaceId) {
        ctx.workspaceId = resource.workspaceId;
      }
      if (resource.folderId && !ctx.folderId) {
        ctx.folderId = resource.folderId;
      }
      if (resource.id && !ctx.resourceId) {
        ctx.resourceId = resource.id;
      }
      if (resource.resourceId && !ctx.resourceId) {
        ctx.resourceId = resource.resourceId;
      }
    }
    // 也支持直接传入 resourceId
    if (initialInput?.resourceId && !ctx.resourceId) {
      ctx.resourceId = initialInput.resourceId;
    }

    // 存储执行上下文，以便在运行时更新
    this.runContexts.set(runId, ctx);

    try {
      await this.cleanupExpiredTempDirs().catch(() => {});
      await fsPromises.mkdir(ctx.tmpDir, { recursive: true }).catch(() => {});
      if (abortController.signal.aborted || rec.status === 'canceled') {
        for (const state of skipWorkflowNodes(rec, ['pending', 'running'], 'canceled', now(), 'canceled')) {
          this.emitTyped('node:status', rec, state);
        }
        return rec;
      }

      // Concurrent nodes share plugin preparation work within the same run.
      const pluginPreparation = new Map<string, Promise<{ ok: boolean; error?: string }>>();
      const getPluginFn = (id: string): ReturnType<typeof getPlugin> => getPlugin(id);

      setWorkflowRunStatus(rec, 'running');
      this.emitTyped('run:status', rec);

      let dagPlan;
      try {
        dagPlan = planWorkflowDag(def);
      } catch (err: any) {
        setWorkflowRunStatus(rec, 'failed', String(err?.message || err));
        finishWorkflowRun(rec, now());
        this.log(runId, 'error', undefined, `[WorkflowEngine] 工作流拓扑校验失败: ${rec.error}`);
        this.emitTyped('run:status', rec);
        return rec;
      }
      const { levels, order, terminalNodeIds } = dagPlan;
      const configuredConcurrency = def.options?.concurrency ?? 1;
      const concurrency = Number.isFinite(configuredConcurrency) ? Math.max(1, Math.min(64, Math.floor(configuredConcurrency))) : 1;
      this.log(runId, 'info', undefined, `[WorkflowEngine] 节点执行顺序:`, order.join(' -> '));
      this.log(runId, 'info', undefined, `[WorkflowEngine] 并发上限: ${concurrency}, 拓扑层数: ${levels.length}`);
      const nodeOutput = new Map<string, Record<string, any>>();

      // Seed start node outputs or initial inputs
      nodeOutput.set('__start__', initialInput);

      const nodeMap = new Map(def.nodes.map((n) => [n.id, n] as const));
      const preparePlugin = (pluginId: string, nodeId: string): Promise<{ ok: boolean; error?: string }> => {
        const existing = pluginPreparation.get(pluginId);
        if (existing) return existing;

        const preparation = (async () => {
          const plugin = getPlugin(pluginId);
          if (!plugin) return { ok: false, error: `Plugin not registered: ${pluginId}` };

          this.log(runId, 'info', nodeId, `[WorkflowEngine] 检查插件 ${pluginId} 是否已安装...`);
          const installed = await plugin.isInstalled(ctx).catch(() => false);
          if (!installed) return { ok: false, error: `Plugin not installed: ${pluginId}` };

          this.log(runId, 'info', nodeId, `[WorkflowEngine] 插件 ${pluginId} 已安装，准备中...`);
          await plugin.prepare?.(ctx).catch((error) => {
            this.log(runId, 'warn', nodeId, `[WorkflowEngine] 插件 ${pluginId} 准备失败:`, error);
          });
          this.log(runId, 'info', nodeId, `[WorkflowEngine] 插件 ${pluginId} 准备完成`);
          return { ok: true };
        })();
        pluginPreparation.set(pluginId, preparation);
        return preparation;
      };

      const executeNode = async (nodeId: string): Promise<'completed' | 'failed' | 'skipped' | 'canceled'> => {
        const currentRecord = this.runs.get(runId);
        if (currentRecord?.status === 'canceled' || abortController.signal.aborted) {
          this.log(runId, 'warn', nodeId, `[WorkflowEngine] 工作流已取消，停止执行`);
          return 'canceled';
        }

        const inst = nodeMap.get(nodeId)!;
        const handler = getNode(inst.type);
        if (!handler) {
          const error = `Unknown node: ${inst.type}`;
          const state = transitionWorkflowNode(rec, nodeId, 'failed', { finishedAt: now(), error, errorReason: 'unknown-node' });
          setWorkflowRunStatus(rec, 'failed', error);
          this.log(runId, 'error', nodeId, `[WorkflowEngine] 节点 ${nodeId} (${inst.type}) 执行失败: ${error}`);
          this.emitTyped('node:status', rec, state);
          return 'failed';
        }

        let inputPorts: PortSchema[];
        try {
          inputPorts = handler.getInputs ? handler.getInputs(inst.config) : handler.spec.inputs || [];
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const state = transitionWorkflowNode(rec, nodeId, 'failed', { finishedAt: now(), error: message, errorReason: 'invalid-node-inputs' });
          setWorkflowRunStatus(rec, 'failed', message);
          this.log(runId, 'error', nodeId, `[WorkflowEngine] 节点 ${nodeId} 输入端口解析失败: ${message}`);
          this.emitTyped('node:status', rec, state);
          return 'failed';
        }

        const incomingEdges = def.edges.filter((edge) => edge.to.nodeId === nodeId);
        const activeIncomingEdges = incomingEdges.filter((edge) => {
          const output = nodeOutput.get(edge.from.nodeId);
          return output !== undefined && Object.prototype.hasOwnProperty.call(output, edge.from.port);
        });
        if (incomingEdges.length > 0 && activeIncomingEdges.length === 0) {
          const state = transitionWorkflowNode(rec, nodeId, 'skipped', { finishedAt: now(), error: 'upstream branch was not selected', errorReason: 'branch-not-selected' });
          this.emitTyped('node:status', rec, state);
          return 'skipped';
        }

        const missingRequiredPorts = inputPorts.filter((port) => {
          if (!port.required || hasValue(inst.inputDefaults?.[port.key]) || hasValue(port.default)) return false;
          const portEdges = incomingEdges.filter((edge) => edge.to.port === port.key);
          if (portEdges.length === 0) return true;
          return !portEdges.some((edge) => hasValue(nodeOutput.get(edge.from.nodeId)?.[edge.from.port]));
        });
        if (missingRequiredPorts.length > 0) {
          const missingKeys = missingRequiredPorts.map((port) => port.key).join(', ');
          const state = transitionWorkflowNode(rec, nodeId, 'skipped', {
            finishedAt: now(),
            error: `required upstream input was not produced: ${missingKeys}`,
            errorReason: 'required-input-missing'
          });
          this.emitTyped('node:status', rec, state);
          return 'skipped';
        }

        // Check required plugins for this node
        if (handler.spec.requires) {
          for (const pluginId of handler.spec.requires) {
            const result = await preparePlugin(pluginId, nodeId);
            if (!result.ok) {
              const plugin = getPlugin(pluginId);
              const error = result.error || `Plugin unavailable: ${pluginId}`;
              const hintArgs = plugin?.installHint ? [`提示: ${plugin.installHint}`] : [];
              const state = transitionWorkflowNode(rec, nodeId, 'failed', { finishedAt: now(), error, errorReason: 'plugin-unavailable' });
              setWorkflowRunStatus(rec, 'failed', error);
              this.log(runId, 'error', nodeId, `[WorkflowEngine] 节点 ${nodeId} 所需插件不可用: ${pluginId}`, ...hintArgs);
              this.emitTyped('node:status', rec, state);
              return 'failed';
            }
          }
        }

        if (abortController.signal.aborted || this.runs.get(runId)?.status === 'canceled') {
          return 'canceled';
        }

        // Special handling for start node: it gets initial input directly from __start__
        let input: Record<string, any>;
        if (inst.type === 'core/start') {
          const initialData = nodeOutput.get('__start__') || {};
          input = { ...Object.fromEntries(inputPorts.filter((port) => port.default !== undefined).map((port) => [port.key, port.default])), ...initialData, ...(inst.inputDefaults || {}) };

          const inputMode = (inst.config?.inputMode as string) || 'resource';
          const missingInput =
            (inputMode === 'text' && !input.text && !initialData.text) ||
            (inputMode === 'url' && !input.url && !initialData.url) ||
            (inputMode === 'file' && !input.file && !initialData.file) ||
            (inputMode === 'folder' && !input.folderId && !initialData.folderId && !ctx.folderId);
          if (missingInput) {
            const error = `开始节点需要${inputMode === 'text' ? '文本' : inputMode === 'url' ? '链接' : inputMode === 'file' ? '文件' : '文件夹'}输入，请提供输入后重试。`;
            const state = transitionWorkflowNode(rec, nodeId, 'failed', { finishedAt: now(), error, errorReason: 'required-input-missing' });
            setWorkflowRunStatus(rec, 'failed', error);
            this.log(runId, 'error', nodeId, `[WorkflowEngine] ${error}`);
            this.emitTyped('node:status', rec, state);
            return 'failed';
          }

          this.log(runId, 'info', nodeId, `[WorkflowEngine] Start节点特殊处理，使用初始输入 + inputDefaults:`, input);
        } else {
          input = {
            ...Object.fromEntries(inputPorts.filter((port) => port.default !== undefined).map((port) => [port.key, port.default])),
            ...mergeInputValues(def, nodeId, nodeOutput),
            ...(inst.inputDefaults || {})
          };
        }

        const runningState = transitionWorkflowNode(rec, nodeId, 'running', { startedAt: now(), input });
        this.emitTyped('node:status', rec, runningState);
        this.log(runId, 'info', nodeId, `[WorkflowEngine] 节点 ${nodeId} (${inst.type}) 开始执行`);
        this.log(runId, 'info', nodeId, `[WorkflowEngine] 节点 ${nodeId} 输入:`, input);
        if (inst.config) this.log(runId, 'info', nodeId, `[WorkflowEngine] 节点 ${nodeId} 配置:`, inst.config);
        const startTime = now();
        try {
          const nodeEmit = (ev: string, payload?: any): void => {
            if (ev === 'node:progress') {
              const progress = payload?.progress !== undefined ? Math.max(0, Math.min(100, payload.progress)) : 0;
              const message = payload?.message;
              const detail = payload?.detail;
              if (nodesState[nodeId]) {
                const state = updateWorkflowNode(rec, nodeId, { progress, progressMessage: message, progressDetail: detail });
                this.emitTyped('node:status', rec, state);
              }
              this.emitTyped('node:progress', runId, nodeId, progress, message, detail);
            } else {
              const payloadWithRunId = payload ? { ...payload, __runId: runId } : { __runId: runId };
              this.emit(ev, payloadWithRunId);
            }
          };
          const out = await handler.run({
            input,
            config: inst.config,
            ctx: {
              ...ctx,
              workflowNodeId: nodeId,
              workflowNodeLabel: inst.name || handler.spec.label || inst.type,
              workflowNodeType: inst.type,
              workflowAttempt: runningState.attempt
            },
            emit: nodeEmit,
            getPlugin: getPluginFn
          });
          const duration = now() - startTime;
          if (abortController.signal.aborted || this.runs.get(runId)?.status === 'canceled') {
            const state = transitionWorkflowNode(rec, nodeId, 'skipped', { finishedAt: now(), error: 'canceled', errorReason: 'canceled' });
            this.emitTyped('node:status', rec, state);
            return 'canceled';
          }
          const output = out || {};
          const completedState = transitionWorkflowNode(rec, nodeId, 'completed', { finishedAt: now(), output });
          nodeOutput.set(nodeId, output);
          this.log(runId, 'info', nodeId, `[WorkflowEngine] 节点 ${nodeId} 执行成功，耗时: ${duration}ms`);
          if (Object.keys(output).length > 0) this.log(runId, 'info', nodeId, `[WorkflowEngine] 节点 ${nodeId} 输出:`, output);
          this.emitTyped('node:status', rec, completedState);
          return 'completed';
        } catch (err: any) {
          const duration = now() - startTime;
          const errorMsg = String(err?.message || err);
          if (abortController.signal.aborted || this.runs.get(runId)?.status === 'canceled') {
            const state = transitionWorkflowNode(rec, nodeId, 'skipped', { finishedAt: now(), error: 'canceled', errorReason: 'canceled' });
            this.emitTyped('node:status', rec, state);
            return 'canceled';
          }
          const state = transitionWorkflowNode(rec, nodeId, 'failed', { finishedAt: now(), error: errorMsg, errorReason: 'execution-error' });
          setWorkflowRunStatus(rec, 'failed', errorMsg);
          this.log(runId, 'error', nodeId, `[WorkflowEngine] 节点 ${nodeId} 执行失败，耗时: ${duration}ms, 错误:`, errorMsg);
          if (err?.stack) this.log(runId, 'error', nodeId, `[WorkflowEngine] 节点 ${nodeId} 错误堆栈:`, err.stack);
          this.emitTyped('node:status', rec, state);
          if (def.options?.errorStrategy === 'continue') {
            this.log(runId, 'warn', nodeId, `[WorkflowEngine] 节点 ${nodeId} 失败，但继续执行后续节点`);
          }
          return 'failed';
        }
      };

      const schedule = await executeWorkflowSchedule({
        levels,
        concurrency,
        errorStrategy: def.options?.errorStrategy,
        shouldStop: () => abortController.signal.aborted || this.runs.get(runId)?.status === 'canceled',
        executeNode
      });

      if (schedule.failedFast && !schedule.canceled) {
        for (const state of skipWorkflowNodes(rec, ['pending'], 'not scheduled after fail-fast', now(), 'not-scheduled')) {
          this.emitTyped('node:status', rec, state);
        }
      }

      const canceled = schedule.canceled || abortController.signal.aborted || this.runs.get(runId)?.status === 'canceled';
      for (const state of finalizeWorkflowRunStatus(rec, canceled, now())) {
        this.emitTyped('node:status', rec, state);
      }

      // Final output: all outputs of terminal nodes (nodes with no outgoing edges)
      const terminalOutput = collectTerminalWorkflowOutput(terminalNodeIds, nodeOutput);
      applyTerminalWorkflowOutput(rec, terminalOutput);
      if (terminalOutput.collisionError && !canceled) this.log(runId, 'error', undefined, `[WorkflowEngine] ${terminalOutput.collisionError}`);
      finishWorkflowRun(rec, now());
      this.log(runId, 'info', undefined, `[WorkflowEngine] 工作流执行完成: ${def.name} (${def.id}), 状态: ${rec.status}`);
      if (Object.keys(terminalOutput.output).length > 0) this.log(runId, 'info', undefined, `[WorkflowEngine] 工作流最终输出:`, terminalOutput.output);
      this.emitTyped('run:status', rec);
      return rec;
    } finally {
      this.runContexts.delete(runId);
      this.abortControllers.delete(runId);
      if (this.runs.get(runId)?.status !== 'completed' || this.completedRunTempTtlMs === 0) {
        await fsPromises.rm(ctx.tmpDir, { recursive: true, force: true }).catch(() => {});
      }
      this.pruneRunCache(runId);
    }
  }
}

export function createEngine(baseCtx: Omit<ExecutionContext, 'tmpDir'>, options?: WorkflowEngineOptions): WorkflowEngine {
  return new WorkflowEngine(baseCtx, options);
}
