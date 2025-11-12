import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getNode, getPlugin } from './registry';
import { EngineEmitter, ExecutionContext, NodeRunState, ValidateResult, WorkflowDefinition, WorkflowRunRecord } from './types';

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
  console.log('mergeInputValues', def, nodeId, JSON.stringify(nodeOutputMap, null, 2));

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

  constructor(private baseCtx: Omit<ExecutionContext, 'tmpDir'>) {
    super();
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
      const fromPort = fromH?.spec.outputs.find((p) => p.key === e.from.port);
      const toPort = toH?.spec.inputs.find((p) => p.key === e.to.port);
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

  async cancel(runId: string): Promise<void> {
    const r = this.runs.get(runId);
    if (!r) return;
    r.status = 'canceled';
    this.emitTyped('run:status', r);
  }

  async run(def: WorkflowDefinition, initialInput: Record<string, any> = {}): Promise<WorkflowRunRecord> {
    const runId = randomUUID();
    const nodesState: Record<string, NodeRunState> = {};
    def.nodes.forEach((n) => (nodesState[n.id] = { nodeId: n.id, status: 'pending' }));
    const rec: WorkflowRunRecord = { runId, workflowId: def.id, createdAt: now(), status: 'queued', nodes: nodesState };
    this.runs.set(runId, rec);
    this.emitTyped('run:status', rec);

    console.log(`[WorkflowEngine] 工作流开始执行: ${def.name} (${def.id}), runId: ${runId}`);
    console.log(`[WorkflowEngine] 初始输入:`, JSON.stringify(initialInput, null, 2));

    const ctx = this.buildCtx();
    await fs.mkdir(ctx.tmpDir, { recursive: true }).catch(() => { });

    // Prepare plugins once per run
    const prepared = new Set<string>();

    const getPluginFn = (id: string): ReturnType<typeof getPlugin> => getPlugin(id);

    rec.status = 'running';
    this.emitTyped('run:status', rec);

    const order = topoSort(def);
    console.log(`[WorkflowEngine] 节点执行顺序:`, order.join(' -> '));
    const nodeOutput = new Map<string, Record<string, any>>();

    // Seed start node outputs or initial inputs
    nodeOutput.set('__start__', initialInput);

    const nodeMap = new Map(def.nodes.map((n) => [n.id, n] as const));

    for (const nodeId of order) {
      // Read latest status from runs map to avoid TS literal narrowing issues
      const currentStatus = this.runs.get(runId)?.status;
      if (currentStatus === 'canceled') {
        console.log(`[WorkflowEngine] 工作流已取消，停止执行`);
        break;
      }
      const inst = nodeMap.get(nodeId)!;
      const handler = getNode(inst.type);
      if (!handler) {
        const error = `Unknown node: ${inst.type}`;
        console.error(`[WorkflowEngine] 节点 ${nodeId} (${inst.type}) 执行失败: ${error}`);
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
              console.error(`[WorkflowEngine] 节点 ${nodeId} 所需插件未注册: ${pid}`);
              nodesState[nodeId] = { ...nodesState[nodeId], status: 'failed', error };
              rec.status = 'failed';
              this.emitTyped('node:status', rec, nodesState[nodeId]);
              this.emitTyped('run:status', rec);
              return rec;
            }
            console.log(`[WorkflowEngine] 检查插件 ${pid} 是否已安装...`);
            const ok = await p.isInstalled(ctx).catch(() => false);
            if (!ok) {
              const error = `Plugin not installed: ${pid}`;
              console.error(`[WorkflowEngine] 节点 ${nodeId} 所需插件未安装: ${pid}, 提示: ${p.installHint || '无'}`);
              nodesState[nodeId] = { ...nodesState[nodeId], status: 'failed', error };
              rec.status = 'failed';
              this.emitTyped('node:status', rec, nodesState[nodeId]);
              this.emitTyped('run:status', rec);
              return rec;
            }
            console.log(`[WorkflowEngine] 插件 ${pid} 已安装，准备中...`);
            await p.prepare?.(ctx).catch((err) => {
              console.warn(`[WorkflowEngine] 插件 ${pid} 准备失败:`, err);
            });
            console.log(`[WorkflowEngine] 插件 ${pid} 准备完成`);
            prepared.add(pid);
          }
        }
      }

      // Special handling for start node: it gets initial input directly from __start__
      let input: Record<string, any>;
      if (inst.type === 'core/start') {
        // Start node receives the entire initial input as its input
        const initialData = nodeOutput.get('__start__') || {};
        input = initialData;
        console.log(`[WorkflowEngine] Start节点特殊处理，使用初始输入:`, JSON.stringify(input, null, 2));
      } else {
        const inputFromEdges = mergeInputValues(def, nodeId, nodeOutput);
        input = { ...inputFromEdges };
        // Apply inline defaults
        Object.assign(input, inst.inputDefaults || {});
      }

      console.log(`[WorkflowEngine] 节点 ${nodeId} (${inst.type}) 开始执行`);
      console.log(`[WorkflowEngine] 节点 ${nodeId} 输入:`, JSON.stringify(input, null, 2));
      if (inst.config) {
        console.log(`[WorkflowEngine] 节点 ${nodeId} 配置:`, JSON.stringify(inst.config, null, 2));
      }

      nodesState[nodeId] = { nodeId, status: 'running', startedAt: now() };
      this.emitTyped('node:status', rec, nodesState[nodeId]);
      const startTime = now();
      try {
        const out = await handler.run({ input, config: inst.config, ctx, emit: (ev, p) => this.emit(ev, p), getPlugin: getPluginFn });
        const duration = now() - startTime;
        nodesState[nodeId] = { ...nodesState[nodeId], status: 'completed', finishedAt: now(), output: out };
        nodeOutput.set(nodeId, out);
        console.log(`[WorkflowEngine] 节点 ${nodeId} 执行成功，耗时: ${duration}ms`);
        console.log(`[WorkflowEngine] 节点 ${nodeId} 输出:`, JSON.stringify(out, null, 2));
        this.emitTyped('node:status', rec, nodesState[nodeId]);
      } catch (err: any) {
        const duration = now() - startTime;
        const errorMsg = String(err?.message || err);
        console.error(`[WorkflowEngine] 节点 ${nodeId} 执行失败，耗时: ${duration}ms, 错误:`, errorMsg);
        if (err?.stack) {
          console.error(`[WorkflowEngine] 节点 ${nodeId} 错误堆栈:`, err.stack);
        }
        nodesState[nodeId] = { ...nodesState[nodeId], status: 'failed', finishedAt: now(), error: errorMsg };
        this.emitTyped('node:status', rec, nodesState[nodeId]);
        if (def.options?.errorStrategy !== 'continue') {
          rec.status = 'failed';
          rec.error = nodesState[nodeId].error;
          console.error(`[WorkflowEngine] 工作流执行失败: ${errorMsg}`);
          this.emitTyped('run:status', rec);
          return rec;
        }
        console.warn(`[WorkflowEngine] 节点 ${nodeId} 失败，但继续执行后续节点`);
      }
    }

    const finalStatus = this.runs.get(runId)?.status;
    if (finalStatus !== 'failed' && finalStatus !== 'canceled') rec.status = 'completed';
    // Final output: all outputs of terminal nodes
    const targets = new Set(def.edges.map((e) => e.from.nodeId));
    const dests = new Set(def.edges.map((e) => e.to.nodeId));
    const terminal = [...targets].filter((n) => !dests.has(n));
    const out: Record<string, any> = {};
    for (const nid of terminal) Object.assign(out, nodeOutput.get(nid) || {});
    rec.output = out;
    console.log(`[WorkflowEngine] 工作流执行完成: ${def.name} (${def.id}), 状态: ${rec.status}`);
    if (rec.output && Object.keys(rec.output).length > 0) {
      console.log(`[WorkflowEngine] 工作流最终输出:`, JSON.stringify(rec.output, null, 2));
    }
    this.emitTyped('run:status', rec);
    return rec;
  }
}

export function createEngine(baseCtx: Omit<ExecutionContext, 'tmpDir'>): WorkflowEngine {
  return new WorkflowEngine(baseCtx);
}
