// Entry point to register workflow system
import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';

import { sendSpriteBusyEnd, sendSpriteBusyProgress, sendSpriteBusyStart } from '../../electron/main/utils/sprite-busy';
import { createEngine } from './engine';
import { DocToMarkdownNode } from './nodes/doc-to-md';
import { EndNode } from './nodes/end';
import { ExtractKeyframesNode } from './nodes/extract-keyframes';
import { LoadResourceNode } from './nodes/load-resource';
import { OCRNode } from './nodes/ocr';
import { StartNode } from './nodes/start';
import { TranscodeNode } from './nodes/transcode';
import { TranscodeAdvancedNode } from './nodes/transcode-advanced';
import { TranscribeWhisperNode } from './nodes/transcribe-whisper';
import { FfmpegPlugin } from './plugins/ffmpeg';
import { TesseractPlugin } from './plugins/tesseract';
import { WhisperPlugin } from './plugins/whisper';
import { getNode, listNodes, listPlugins, registerNode, registerPlugin } from './registry';
import { loadPresetWorkflows, WorkflowStore } from './store';
import { NodeConfig, WorkflowDefinition } from './types';

export function initWorkflowSystem(): void {
  // Register plugins first
  registerPlugin(FfmpegPlugin);
  registerPlugin(TesseractPlugin);
  registerPlugin(WhisperPlugin);
  // Register nodes
  [StartNode, EndNode, LoadResourceNode, TranscodeNode, TranscodeAdvancedNode, OCRNode, TranscribeWhisperNode, DocToMarkdownNode, ExtractKeyframesNode].forEach(registerNode);

  const engine = createEngine({
    resourcesDir: path.join(process.env.APP_ROOT || process.cwd(), 'resources'),
    userDataDir: app.getPath('userData'),
    workspaceDir: undefined
  });
  // expose engine via closure only (no global)

  // Persist run updates
  const broadcast = (channel: string, payload: any): void => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    });
  };

  // 跟踪工作流执行进度
  const workflowProgress = new Map<string, { totalNodes: number; workflowName: string }>();

  engine.onTyped('run:status', async (rec) => {
    await WorkflowStore.updateRun(rec).catch(() => { });
    broadcast('wf:run-status', rec);

    // 处理繁忙状态
    if (rec.status === 'running' && !workflowProgress.has(rec.runId)) {
      // 工作流开始执行
      const totalNodes = Object.keys(rec.nodes).length;
      // 尝试获取工作流名称（异步获取，不阻塞，使用缓存）
      const workflowName = rec.workflowId;
      loadPresetWorkflows()
        .then((preset) => {
          return WorkflowStore.list().then((custom) => {
            const allDefs = [...preset, ...custom];
            const def = allDefs.find((d) => d.id === rec.workflowId);
            if (def?.name) {
              const progress = workflowProgress.get(rec.runId);
              if (progress) {
                progress.workflowName = def.name;
                sendSpriteBusyProgress(
                  Math.round((Object.values(rec.nodes).filter((n) => n.status === 'completed' || n.status === 'failed' || n.status === 'skipped').length / totalNodes) * 100),
                  `执行工作流: ${def.name}`
                );
              }
            }
          });
        })
        .catch(() => { });
      workflowProgress.set(rec.runId, { totalNodes, workflowName });
      sendSpriteBusyStart(0, `执行工作流: ${workflowName}`);
    } else if ((rec.status === 'completed' || rec.status === 'failed' || rec.status === 'canceled') && workflowProgress.has(rec.runId)) {
      // 工作流结束
      const progress = workflowProgress.get(rec.runId);
      if (progress) {
        const statusText = rec.status === 'completed' ? '完成' : rec.status === 'failed' ? '失败' : '已取消';
        sendSpriteBusyProgress(100, `工作流${statusText}: ${progress.workflowName}`);
        sendSpriteBusyEnd();
      }
      workflowProgress.delete(rec.runId);
    }
  });
  engine.onTyped('node:status', async (rec, node) => {
    await WorkflowStore.updateRun(rec).catch(() => { });
    broadcast('wf:node-status', { runId: rec.runId, workflowId: rec.workflowId, node });

    // 更新工作流执行进度（当节点状态变化时，如果没有节点进度，则使用整体进度）
    if (workflowProgress.has(rec.runId)) {
      const progress = workflowProgress.get(rec.runId)!;
      const nodes = rec.nodes;
      const completedNodes = Object.values(nodes).filter((n) => n.status === 'completed' || n.status === 'failed' || n.status === 'skipped').length;
      const currentProgress = Math.round((completedNodes / progress.totalNodes) * 100);

      rec.progress = currentProgress;

      // 获取当前正在运行的节点名称
      const runningNode = Object.values(nodes).find((n) => n.status === 'running');
      let progressMessage = '';
      if (runningNode) {
        // 尝试获取节点类型和名称（使用缓存）
        const preset = await loadPresetWorkflows().catch(() => []);
        const custom = await WorkflowStore.list().catch(() => []);
        const allDefs = [...preset, ...custom];
        const def = allDefs.find((d) => d.id === rec.workflowId);
        const nodeInstance = def?.nodes.find((n) => n.id === runningNode.nodeId);
        const nodeLabel = nodeInstance?.name || nodeInstance?.type || runningNode.nodeId;
        progressMessage = `${nodeLabel} 执行中`;
        sendSpriteBusyProgress(currentProgress, `执行工作流: ${progress.workflowName} - ${nodeLabel}`);
      } else {
        progressMessage = '执行中';
        sendSpriteBusyProgress(currentProgress, `执行工作流: ${progress.workflowName}`);
      }
      rec.progressMessage = progressMessage;
      await WorkflowStore.updateRun(rec).catch(() => { });
      broadcast('wf:run-status', rec);
    }
  });

  // 监听节点进度事件
  engine.onTyped('node:progress', (runId, nodeId, progress, message) => {
    if (!workflowProgress.has(runId)) return;

    const workflowProg = workflowProgress.get(runId)!;
    const rec = engine.getRun(runId);
    if (!rec) return;

    // 使用缓存的工作流定义，避免频繁加载
    loadPresetWorkflows()
      .then((preset) => {
        return WorkflowStore.list().then((custom) => {
          const allDefs = [...preset, ...custom];
          const def = allDefs.find((d) => d.id === rec.workflowId);
          const nodeInstance = def?.nodes.find((n) => n.id === nodeId);
          const nodeLabel = nodeInstance?.name || nodeInstance?.type || nodeId;

          // 计算整体进度：已完成节点 + 当前节点进度
          const nodes = rec.nodes;
          const completedNodes = Object.values(nodes).filter((n) => n.status === 'completed' || n.status === 'failed' || n.status === 'skipped').length;
          // 当前节点的贡献 = 1 / totalNodes * nodeProgress
          const nodeContribution = (1 / workflowProg.totalNodes) * (progress / 100);
          const overallProgress = Math.round((completedNodes / workflowProg.totalNodes + nodeContribution) * 100);

          // 构建消息
          const progressMessage = message || `${nodeLabel} 执行中`;

          // Update record progress
          rec.progress = overallProgress;
          rec.progressMessage = progressMessage;
          // Persist progress update (debounced by store)
          WorkflowStore.updateRun(rec).catch(() => { });
          // Broadcast run status update to UI
          broadcast('wf:run-status', rec);

          sendSpriteBusyProgress(overallProgress, `执行工作流: ${workflowProg.workflowName} - ${progressMessage}`);
        });
      })
      .catch(() => {
        // 如果获取节点信息失败，使用默认消息
        const progressMessage = message || `${nodeId} 执行中`;
        sendSpriteBusyProgress(progress, `执行工作流: ${workflowProg.workflowName} - ${progressMessage}`);
      });
  });
  engine.onTyped('run:log', (runId, entry) => {
    broadcast('wf:run-log', { runId, entry });
  });

  // IPC endpoints
  ipcMain.handle('wf:listNodes', () => listNodes().map((n) => n.spec));
  ipcMain.handle('wf:getNodeOutputs', async (_e, payload: { nodeId: string; config?: NodeConfig }) => {
    const handler = getNode(payload.nodeId);
    if (!handler) return { ok: false, error: 'Node not found' };
    // 如果节点有 getOutputs 方法，使用它；否则使用 spec.outputs
    const outputs = handler.getOutputs ? handler.getOutputs(payload.config) : handler.spec.outputs;
    return { ok: true, outputs };
  });
  ipcMain.handle('wf:listPlugins', () => listPlugins().map((p) => ({ id: p.id, label: p.label, installed: false })));
  ipcMain.handle('wf:listDefinitions', async () => {
    // 合并预设工作流和用户自定义工作流（使用缓存）
    const [preset, custom] = await Promise.all([loadPresetWorkflows(), WorkflowStore.list()]);
    return [...preset, ...custom];
  });
  ipcMain.handle('wf:listPresets', async () => {
    // 只返回预设工作流（使用缓存）
    return loadPresetWorkflows();
  });
  ipcMain.handle('wf:isPreset', async (_e, payload: { id: string }) => {
    // 检查工作流是否为预设工作流（使用缓存）
    const preset = await loadPresetWorkflows();
    return preset.some((w) => w.id === payload.id);
  });
  ipcMain.handle('wf:getDefinition', async (_e, payload: { id: string }) => {
    // 先尝试从预设工作流中查找（使用缓存）
    const preset = await loadPresetWorkflows();
    const presetDef = preset.find((d) => d.id === payload.id);
    if (presetDef) return presetDef;
    // 再从用户自定义工作流中查找
    return WorkflowStore.get(payload.id);
  });
  ipcMain.handle('wf:saveDefinition', async (_e, payload: { def: WorkflowDefinition }) => {
    try {
      await WorkflowStore.upsert(payload.def);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });
  ipcMain.handle('wf:deleteDefinition', async (_e, payload: { id: string }) => {
    try {
      await WorkflowStore.remove(payload.id);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });
  ipcMain.handle('wf:validate', async (_e, payload: { def: WorkflowDefinition }) => {
    return engine.validate(payload.def);
  });
  ipcMain.handle('wf:run', async (_e, payload: { defId: string; input?: Record<string, any>; metadata?: Record<string, any> }) => {
    // 先尝试从预设工作流中查找
    const preset = await loadPresetWorkflows();
    let def = preset.find((d) => d.id === payload.defId);
    // 如果预设中没有，再从用户自定义工作流中查找
    if (!def) {
      def = await WorkflowStore.get(payload.defId);
    }
    if (!def) return { ok: false, error: 'Workflow not found' };
    const validation = await engine.validate(def);
    if (!validation.ok) {
      console.warn('[WorkflowSystem] 工作流验证失败:', validation);
      return { ok: false, validation };
    }

    const rec = await engine.run(def, payload.input || {}, payload.metadata);
    // await WorkflowStore.addRun(rec); // 移除重复保存，engine.on('run:status') 已经处理了保存
    return { ok: true, runId: rec.runId };
  });
  ipcMain.handle('wf:getRun', async (_e, payload: { runId: string }) => engine.getRun(payload.runId));
  ipcMain.handle('wf:listRuns', async (_e, payload?: { defId?: string; limit?: number; resourceId?: string; spaceId?: string }) =>
    WorkflowStore.listRuns(payload?.defId, payload?.limit, payload?.resourceId, payload?.spaceId)
  );
  ipcMain.handle('wf:deleteRun', async (_e, payload: { runId: string; spaceId?: string }) => {
    await WorkflowStore.removeRun(payload.runId, payload.spaceId);
    return { ok: true };
  });
  ipcMain.handle('wf:cancelRun', async (_e, payload: { runId: string }) => {
    await engine.cancel(payload.runId);
    return { ok: true };
  });
  ipcMain.handle('wf:getRunLogs', async (_e, payload: { runId: string }) => engine.getRunLogs(payload.runId));

  // 获取工作流任务结果文件（基于文件路径）
  ipcMain.handle('wf:getTaskResults', async (_e, payload: { filePath: string }) => {
    try {
      if (!payload.filePath) {
        return { ok: false, error: '缺少文件路径' };
      }
      const { scanTaskResults } = await import('./task-results');
      const results = await scanTaskResults(payload.filePath);
      return { ok: true, data: results };
    } catch (e: any) {
      console.warn('[wf:getTaskResults] 获取任务结果失败', e);
      return { ok: false, error: e?.message || 'unknown-error' };
    }
  });
}
