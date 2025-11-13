// Entry point to register workflow system
import path from 'node:path';

import { app, ipcMain } from 'electron';

import { createEngine } from './engine';
import { DocToMarkdownNode } from './nodes/doc-to-md';
import { EndNode } from './nodes/end';
import { LoadResourceNode } from './nodes/load-resource';
import { OCRNode } from './nodes/ocr';
import { StartNode } from './nodes/start';
import { TranscodeNode } from './nodes/transcode';
import { TranscodeAdvancedNode } from './nodes/transcode-advanced';
import { TranscribeWhisperNode } from './nodes/transcribe-whisper';
import { FfmpegPlugin } from './plugins/ffmpeg';
import { TesseractPlugin } from './plugins/tesseract';
import { WhisperPlugin } from './plugins/whisper';
import { listNodes, listPlugins, registerNode, registerPlugin } from './registry';
import { loadPresetWorkflows, WorkflowStore } from './store';
import { WorkflowDefinition } from './types';

export function initWorkflowSystem(): void {
  // Register plugins first
  registerPlugin(FfmpegPlugin);
  registerPlugin(TesseractPlugin);
  registerPlugin(WhisperPlugin);
  // Register nodes
  [StartNode, EndNode, LoadResourceNode, TranscodeNode, TranscodeAdvancedNode, OCRNode, TranscribeWhisperNode, DocToMarkdownNode].forEach(registerNode);

  const engine = createEngine({
    resourcesDir: path.join(process.env.APP_ROOT || process.cwd(), 'resources'),
    userDataDir: app.getPath('userData'),
    workspaceDir: undefined
  });
  // expose engine via closure only (no global)

  // Persist run updates
  engine.onTyped('run:status', async (rec) => {
    await WorkflowStore.updateRun(rec).catch(() => { });
    if (rec.status === 'completed' || rec.status === 'failed' || rec.status === 'canceled') {
      // final state maybe broadcast
    }
  });
  engine.onTyped('node:status', async (rec) => {
    await WorkflowStore.updateRun(rec).catch(() => { });
  });

  // IPC endpoints
  ipcMain.handle('wf:listNodes', () => listNodes().map((n) => n.spec));
  ipcMain.handle('wf:listPlugins', () => listPlugins().map((p) => ({ id: p.id, label: p.label, installed: false })));
  ipcMain.handle('wf:listDefinitions', async () => {
    // 合并预设工作流和用户自定义工作流
    const [preset, custom] = await Promise.all([loadPresetWorkflows(), WorkflowStore.list()]);
    return [...preset, ...custom];
  });
  ipcMain.handle('wf:listPresets', async () => {
    // 只返回预设工作流
    return loadPresetWorkflows();
  });
  ipcMain.handle('wf:getDefinition', async (_e, payload: { id: string }) => {
    // 先尝试从预设工作流中查找
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
  ipcMain.handle('wf:run', async (_e, payload: { defId: string; input?: Record<string, any> }) => {
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

    const rec = await engine.run(def, payload.input || {});
    await WorkflowStore.addRun(rec);
    return { ok: true, runId: rec.runId };
  });
  ipcMain.handle('wf:getRun', async (_e, payload: { runId: string }) => engine.getRun(payload.runId));
  ipcMain.handle('wf:listRuns', async (_e, payload?: { defId?: string; limit?: number }) => WorkflowStore.listRuns(payload?.defId, payload?.limit));
  ipcMain.handle('wf:cancelRun', async (_e, payload: { runId: string }) => {
    await engine.cancel(payload.runId);
    return { ok: true };
  });
}
