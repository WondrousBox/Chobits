import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';

import { getNode, getPlugin } from './registry';
import { EngineEmitter, ExecutionContext, NodeRunState, ValidateResult, WorkflowDefinition, WorkflowRunLogEntry, WorkflowRunLogLevel, WorkflowRunRecord } from './types';

function now(): number {
  return Date.now();
}

function topoSort(def: WorkflowDefinition): string[] {
  const incoming = new Map<string, number>();
  def.nodes.forEach((n) => incoming.set(n.id, 0));
  def.edges.forEach((e) => incoming.set(e.to.nodeId, (incoming.get(e.to.nodeId) || 0) + 1));
  const queue = def.nodes.filter((n) => (incoming.get(n.id) || 0) === 0).map((n) => n.id);
  const order: string[] = [];
  const outAdj = new Map<string, string[]>();
  def.edges.forEach((e) => {
    const arr = outAdj.get(e.from.nodeId) || [];
    arr.push(e.to.nodeId);
    outAdj.set(e.from.nodeId, arr);
  });
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    const outs = outAdj.get(id) || [];
    for (const to of outs) {
      incoming.set(to, (incoming.get(to) || 0) - 1);
      if ((incoming.get(to) || 0) === 0) queue.push(to);
    }
  }
  if (order.length !== def.nodes.length) throw new Error('Workflow has cycles or disconnected nodes');
  return order;
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

export class WorkflowEngine extends EngineEmitter {
  private runs = new Map<string, WorkflowRunRecord>();
  private runLogs = new Map<string, WorkflowRunLogEntry[]>();
  // 存储每个运行的工作流的执行上下文
  private runContexts = new Map<string, ExecutionContext>();

  constructor(private baseCtx: Omit<ExecutionContext, 'tmpDir'>) {
    super();
  }

  private log(runId: string, level: WorkflowRunLogLevel, nodeId: string | undefined, ...args: any[]): void {
    const printer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    printer(...args);
    const message = args.map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg, { depth: 6, colors: false, compact: false }))).join(' ');
    const entry: WorkflowRunLogEntry = {
      runId,
      level,
      message,
      nodeId,
      timestamp: now()
    };
    const existing = this.runLogs.get(runId);
    if (existing) {
      existing.push(entry);
      if (existing.length > 1000) {
        existing.splice(0, existing.length - 1000);
      }
    } else {
      this.runLogs.set(runId, [entry]);
    }
    this.emitTyped('run:log', runId, entry);
  }

  buildCtx(): ExecutionContext {
    const tmpDir = path.join(os.tmpdir(), 'chobits-workflow', randomUUID());
    return { ...this.baseCtx, tmpDir };
  }

  async validate(def: WorkflowDefinition): Promise<ValidateResult> {
    const errors: string[] = [];
    const missingPlugins: { id: string; hint?: string }[] = [];
    // nodes exist
    for (const n of def.nodes) {
      const handler = getNode(n.type);
      if (!handler) errors.push(`Unknown node type: ${n.type} in node ${n.id}`);
    }
    // edges ports exist
    for (const e of def.edges) {
      const from = def.nodes.find((n) => n.id === e.from.nodeId);
      const to = def.nodes.find((n) => n.id === e.to.nodeId);
      if (!from || !to) errors.push(`Invalid edge ${e.id}: node not found`);
      const fromH = from ? getNode(from.type) : undefined;
      const toH = to ? getNode(to.type) : undefined;

      // 支持动态输入/输出端口：优先使用 handler.getOutputs/getInputs，其次回落到静态 spec 定义
      const fromOutputs = fromH && 'getOutputs' in fromH && typeof fromH.getOutputs === 'function' ? fromH.getOutputs(from.config) : fromH?.spec.outputs || [];
      const toInputs = toH && 'getInputs' in toH && typeof toH.getInputs === 'function' ? toH.getInputs(to.config) : toH?.spec.inputs || [];

      const fromPort = fromOutputs.find((p) => p.key === e.from.port);
      const toPort = toInputs.find((p) => p.key === e.to.port);
      if (!fromPort) errors.push(`Edge ${e.id}: output port not found: ${e.from.nodeId}.${e.from.port}`);
      if (!toPort) errors.push(`Edge ${e.id}: input port not found: ${e.to.nodeId}.${e.to.port}`);
    }
    // topo
    try {
      topoSort(def);
    } catch (err: any) {
      errors.push(String(err?.message || err));
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
        errors.push(`Required plugin not registered: ${id}`);
        continue;
      }
      const ok = await p.isInstalled(ctx).catch(() => false);
      if (!ok) missingPlugins.push({ id, hint: p.installHint });
    }
    return { ok: errors.length === 0 && missingPlugins.length === 0, errors: errors.length ? errors : undefined, missingPlugins: missingPlugins.length ? missingPlugins : undefined };
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
    if (!r) return;
    r.status = 'canceled';
    this.emitTyped('run:status', r);
  }

  async run(def: WorkflowDefinition, initialInput: Record<string, any> = {}, metadata?: Record<string, any>): Promise<WorkflowRunRecord> {
    const runId = randomUUID();
    const nodesState: Record<string, NodeRunState> = {};
    def.nodes.forEach((n) => (nodesState[n.id] = { nodeId: n.id, status: 'pending' }));
    const rec: WorkflowRunRecord = { runId, workflowId: def.id, createdAt: now(), status: 'queued', nodes: nodesState, metadata };
    this.runs.set(runId, rec);
    this.emitTyped('run:status', rec);

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

    // 从 metadata 或 initialInput 中提取工作空间和文件夹信息
    // metadata 中可能有 spaceId (workspaceId) 和 folderId
    if (metadata?.spaceId) {
      ctx.workspaceId = metadata.spaceId;
    }
    if (metadata?.folderId) {
      ctx.folderId = metadata.folderId;
    }
    // 从 initialInput 中的 resource 对象获取工作空间和文件夹信息
    if (initialInput?.resource) {
      const resource = initialInput.resource;
      if (resource.workspaceId && !ctx.workspaceId) {
        ctx.workspaceId = resource.workspaceId;
      }
      if (resource.folderId && !ctx.folderId) {
        ctx.folderId = resource.folderId;
      }
    }

    // 存储执行上下文，以便在运行时更新
    this.runContexts.set(runId, ctx);

    await fs.mkdir(ctx.tmpDir, { recursive: true }).catch(() => { });

    // Prepare plugins once per run
    const prepared = new Set<string>();

    const getPluginFn = (id: string): ReturnType<typeof getPlugin> => getPlugin(id);

    rec.status = 'running';
    this.emitTyped('run:status', rec);

    const order = topoSort(def);
    this.log(runId, 'info', undefined, `[WorkflowEngine] 节点执行顺序:`, order.join(' -> '));
    const nodeOutput = new Map<string, Record<string, any>>();

    // Seed start node outputs or initial inputs
    nodeOutput.set('__start__', initialInput);

    const nodeMap = new Map(def.nodes.map((n) => [n.id, n] as const));

    for (const nodeId of order) {
      // Read latest status from runs map to avoid TS literal narrowing issues
      const currentStatus = this.runs.get(runId)?.status;
      if (currentStatus === 'canceled') {
        this.log(runId, 'warn', nodeId, `[WorkflowEngine] 工作流已取消，停止执行`);
        break;
      }
      const inst = nodeMap.get(nodeId)!;
      const handler = getNode(inst.type);
      if (!handler) {
        const error = `Unknown node: ${inst.type}`;
        this.log(runId, 'error', nodeId, `[WorkflowEngine] 节点 ${nodeId} (${inst.type}) 执行失败: ${error}`);
        nodesState[nodeId] = { ...nodesState[nodeId], status: 'failed', error };
        if (def.options?.errorStrategy !== 'continue') break;
        continue;
      }
      // Check required plugins for this node
      if (handler.spec.requires) {
        for (const pid of handler.spec.requires) {
          if (!prepared.has(pid)) {
            const p = getPlugin(pid);
            if (!p) {
              const error = `Plugin not registered: ${pid}`;
              this.log(runId, 'error', nodeId, `[WorkflowEngine] 节点 ${nodeId} 所需插件未注册: ${pid}`);
              nodesState[nodeId] = { ...nodesState[nodeId], status: 'failed', error };
              rec.status = 'failed';
              this.emitTyped('node:status', rec, nodesState[nodeId]);
              this.emitTyped('run:status', rec);
              return rec;
            }
            this.log(runId, 'info', nodeId, `[WorkflowEngine] 检查插件 ${pid} 是否已安装...`);
            const ok = await p.isInstalled(ctx).catch(() => false);
            if (!ok) {
              const error = `Plugin not installed: ${pid}`;
              const hintArgs = p.installHint ? [`提示: ${p.installHint}`] : [];
              this.log(runId, 'error', nodeId, `[WorkflowEngine] 节点 ${nodeId} 所需插件未安装: ${pid}`, ...hintArgs);
              nodesState[nodeId] = { ...nodesState[nodeId], status: 'failed', error };
              rec.status = 'failed';
              this.emitTyped('node:status', rec, nodesState[nodeId]);
              this.emitTyped('run:status', rec);
              return rec;
            }
            this.log(runId, 'info', nodeId, `[WorkflowEngine] 插件 ${pid} 已安装，准备中...`);
            await p.prepare?.(ctx).catch((err) => {
              this.log(runId, 'warn', nodeId, `[WorkflowEngine] 插件 ${pid} 准备失败:`, err);
            });
            this.log(runId, 'info', nodeId, `[WorkflowEngine] 插件 ${pid} 准备完成`);
            prepared.add(pid);
          }
        }
      }

      // Special handling for start node: it gets initial input directly from __start__
      let input: Record<string, any>;
      if (inst.type === 'core/start') {
        // Start 节点同时需要：
        // 1）引擎在运行时传入的 initialInput（如资源信息）
        // 2）在画布里用户在开始节点上填写的 inline 输入（保存在 inputDefaults 中）
        const initialData = nodeOutput.get('__start__') || {};
        input = { ...initialData, ...(inst.inputDefaults || {}) };

        // 检查开始节点是否需要输入但没有提供
        const inputMode = (inst.config?.inputMode as string) || 'resource';
        if (inputMode === 'text' && !input.text && !initialData.text) {
          // 需要文本输入但没有提供，发出事件通知前端打开输入窗口
          this.emit('wf:start-input-required', {
            defId: def.id,
            inputMode: 'text',
            metadata
          });
          const error = '开始节点需要文本输入，已弹出输入窗口，请完成输入后重试。';
          this.log(runId, 'error', nodeId, `[WorkflowEngine] ${error}`);
          nodesState[nodeId] = { nodeId, status: 'failed', error };
          rec.status = 'failed';
          rec.error = error;
          this.emitTyped('node:status', rec, nodesState[nodeId]);
          this.emitTyped('run:status', rec);
          return rec;
        }
        if (inputMode === 'url' && !input.url && !initialData.url) {
          // 需要链接输入但没有提供，发出事件通知前端打开输入窗口
          this.emit('wf:start-input-required', {
            defId: def.id,
            inputMode: 'url',
            metadata
          });
          const error = '开始节点需要链接输入，已弹出输入窗口，请完成输入后重试。';
          this.log(runId, 'error', nodeId, `[WorkflowEngine] ${error}`);
          nodesState[nodeId] = { nodeId, status: 'failed', error };
          rec.status = 'failed';
          rec.error = error;
          this.emitTyped('node:status', rec, nodesState[nodeId]);
          this.emitTyped('run:status', rec);
          return rec;
        }
        if (inputMode === 'file' && !input.file && !initialData.file) {
          // 需要文件输入但没有提供，发出事件通知前端打开输入窗口
          this.emit('wf:start-input-required', {
            defId: def.id,
            inputMode: 'file',
            metadata
          });
          const error = '开始节点需要文件输入，已弹出输入窗口，请完成输入后重试。';
          this.log(runId, 'error', nodeId, `[WorkflowEngine] ${error}`);
          nodesState[nodeId] = { nodeId, status: 'failed', error };
          rec.status = 'failed';
          rec.error = error;
          this.emitTyped('node:status', rec, nodesState[nodeId]);
          this.emitTyped('run:status', rec);
          return rec;
        }

        this.log(runId, 'info', nodeId, `[WorkflowEngine] Start节点特殊处理，使用初始输入 + inputDefaults:`, input);
      } else {
        const inputFromEdges = mergeInputValues(def, nodeId, nodeOutput);
        input = { ...inputFromEdges };
        // Apply inline defaults
        Object.assign(input, inst.inputDefaults || {});
      }

      this.log(runId, 'info', nodeId, `[WorkflowEngine] 节点 ${nodeId} (${inst.type}) 开始执行`);
      this.log(runId, 'info', nodeId, `[WorkflowEngine] 节点 ${nodeId} 输入:`, input);
      if (inst.config) {
        this.log(runId, 'info', nodeId, `[WorkflowEngine] 节点 ${nodeId} 配置:`, inst.config);
      }

      nodesState[nodeId] = { nodeId, status: 'running', startedAt: now() };
      this.emitTyped('node:status', rec, nodesState[nodeId]);
      const startTime = now();
      try {
        // 创建包装的 emit 函数，自动处理 node:progress 事件
        const nodeEmit = (ev: string, payload?: any): void => {
          if (ev === 'node:progress') {
            // 节点发送进度事件，转换为引擎的 node:progress 事件
            const progress = payload?.progress !== undefined ? Math.max(0, Math.min(100, payload.progress)) : 0;
            const message = payload?.message;

            // Update node state
            if (nodesState[nodeId]) {
              nodesState[nodeId] = { ...nodesState[nodeId], progress, progressMessage: message };
              // Emit node status update so UI can reflect progress immediately
              this.emitTyped('node:status', rec, nodesState[nodeId]);
            }

            this.emitTyped('node:progress', runId, nodeId, progress, message);
          } else {
            // 其他事件直接转发，并在 payload 中包含 runId 以便事件处理可以更新上下文
            const payloadWithRunId = payload ? { ...payload, __runId: runId } : { __runId: runId };
            this.emit(ev, payloadWithRunId);
          }
        };
        const out = await handler.run({ input, config: inst.config, ctx, emit: nodeEmit, getPlugin: getPluginFn });
        const duration = now() - startTime;
        nodesState[nodeId] = { ...nodesState[nodeId], status: 'completed', finishedAt: now(), output: out };
        nodeOutput.set(nodeId, out);
        this.log(runId, 'info', nodeId, `[WorkflowEngine] 节点 ${nodeId} 执行成功，耗时: ${duration}ms`);
        if (out && Object.keys(out).length > 0) {
          this.log(runId, 'info', nodeId, `[WorkflowEngine] 节点 ${nodeId} 输出:`, out);
        }
        this.emitTyped('node:status', rec, nodesState[nodeId]);
      } catch (err: any) {
        const duration = now() - startTime;
        const errorMsg = String(err?.message || err);
        this.log(runId, 'error', nodeId, `[WorkflowEngine] 节点 ${nodeId} 执行失败，耗时: ${duration}ms, 错误:`, errorMsg);
        if (err?.stack) {
          this.log(runId, 'error', nodeId, `[WorkflowEngine] 节点 ${nodeId} 错误堆栈:`, err.stack);
        }
        nodesState[nodeId] = { ...nodesState[nodeId], status: 'failed', finishedAt: now(), error: errorMsg };
        this.emitTyped('node:status', rec, nodesState[nodeId]);
        if (def.options?.errorStrategy !== 'continue') {
          rec.status = 'failed';
          rec.error = nodesState[nodeId].error;
          this.log(runId, 'error', nodeId, `[WorkflowEngine] 工作流执行失败: ${errorMsg}`);
          this.emitTyped('run:status', rec);
          return rec;
        }
        this.log(runId, 'warn', nodeId, `[WorkflowEngine] 节点 ${nodeId} 失败，但继续执行后续节点`);
      }
    }

    const finalStatus = this.runs.get(runId)?.status;
    if (finalStatus !== 'failed' && finalStatus !== 'canceled') rec.status = 'completed';

    // 清理执行上下文（工作流执行完成）
    this.runContexts.delete(runId);

    // Final output: all outputs of terminal nodes
    const targets = new Set(def.edges.map((e) => e.from.nodeId));
    const dests = new Set(def.edges.map((e) => e.to.nodeId));
    const terminal = [...targets].filter((n) => !dests.has(n));
    const out: Record<string, any> = {};
    for (const nid of terminal) Object.assign(out, nodeOutput.get(nid) || {});
    rec.output = out;
    this.log(runId, 'info', undefined, `[WorkflowEngine] 工作流执行完成: ${def.name} (${def.id}), 状态: ${rec.status}`);
    if (rec.output && Object.keys(rec.output).length > 0) {
      this.log(runId, 'info', undefined, `[WorkflowEngine] 工作流最终输出:`, rec.output);
    }
    this.emitTyped('run:status', rec);
    return rec;
  }
}

export function createEngine(baseCtx: Omit<ExecutionContext, 'tmpDir'>): WorkflowEngine {
  return new WorkflowEngine(baseCtx);
}
