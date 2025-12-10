// Entry point to register workflow system
import path from 'node:path';

import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import { BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';

import { FoldersRepo, ResourcesRepo, WorkspacesRepo } from '../../electron/main/db/repositories';
import { getResourcePath } from '../../electron/main/utils/resources-path';
import { detectBasicType } from '../../electron/main/utils/thumbnail';
import { eventManager, sendAppBusyEnd, sendAppBusyProgress, sendAppBusyStart } from '../event';
import { AppEvent } from '../event/events';
import { pluginResourceManager } from '../plugins';
import { createEngine, WorkflowEngine } from './engine';
import { AiChatNode } from './nodes/ai-chat';
import { AiPromptOptimizerNode } from './nodes/ai-prompt-optimizer';
import { CollectFolderTextsNode } from './nodes/collect-folder-texts';
import { ConditionNode } from './nodes/condition';
import { DisplayImageNode } from './nodes/display-image';
import { DisplayMediaNode } from './nodes/display-media';
import { DisplayResourceCardNode } from './nodes/display-resource-card';
import { DisplayTextNode } from './nodes/display-text';
import { DocToMarkdownNode } from './nodes/doc-to-md';
import { EndNode } from './nodes/end';
import { ExtractKeyframesNode } from './nodes/extract-keyframes';
import { ImageGenerateNode } from './nodes/image-generate';
import { ImageUnderstandNode } from './nodes/image-understand';
import { OCRNode } from './nodes/ocr';
import { ResourceCreateNode } from './nodes/resource-create';
import { ResourceLoadNode } from './nodes/resource-load';
import { ResourceUpdateNode } from './nodes/resource-update';
import { StartNode } from './nodes/start';
import { TextOutputNode } from './nodes/text-output';
import { TextToImageNode } from './nodes/text-to-image';
import { TranscodeNode } from './nodes/transcode';
import { TranscodeAdvancedNode } from './nodes/transcode-advanced';
import { TranscribeWhisperNode } from './nodes/transcribe-whisper';
import { FfmpegPlugin } from './plugins/ffmpeg';
import { TesseractPlugin } from './plugins/tesseract';
import { WhisperPlugin } from './plugins/whisper';
import { getNode, listNodes, listPlugins, registerNode, registerPlugin } from './registry';
import { loadPresetWorkflows, WorkflowStore } from './store';
import { NodeConfig, WorkflowDefinition, WorkflowRunRecord } from './types';

// 存储获取插件配置文件路径的方法
let getWorkflowDefinitionsPathFn: () => string;
let globalEngine: WorkflowEngine | undefined;

export async function runWorkflow(def: WorkflowDefinition, input?: any): Promise<WorkflowRunRecord> {
  if (!globalEngine) throw new Error('Workflow engine not initialized');
  return globalEngine.run(def, input || {});
}

export async function getWorkflow(id: string): Promise<WorkflowDefinition | undefined> {
  if (getWorkflowDefinitionsPathFn) {
    const preset = await loadPresetWorkflows(getWorkflowDefinitionsPathFn());
    const presetDef = preset.find((d) => d.id === id);
    if (presetDef) return presetDef;
  }
  return WorkflowStore.get(id);
}

export function initWorkflowSystem(options: { getWorkflowDefinitionsPath: () => string }): void {
  const { getWorkflowDefinitionsPath } = options || {};
  if (!getWorkflowDefinitionsPath) {
    throw new Error('getWorkflowDefinitionsPath is required');
  }
  getWorkflowDefinitionsPathFn = getWorkflowDefinitionsPath;
  // Register plugins first
  registerPlugin(FfmpegPlugin);
  registerPlugin(TesseractPlugin);
  registerPlugin(WhisperPlugin);
  // Register nodes
  [
    StartNode,
    EndNode,
    TextOutputNode,
    TextToImageNode,
    ResourceLoadNode,
    ResourceCreateNode,
    ResourceUpdateNode,
    CollectFolderTextsNode,
    ConditionNode,
    TranscodeNode,
    TranscodeAdvancedNode,
    OCRNode,
    TranscribeWhisperNode,
    DocToMarkdownNode,
    ExtractKeyframesNode,
    ImageUnderstandNode,
    ImageGenerateNode,
    AiChatNode,
    AiPromptOptimizerNode,
    DisplayTextNode,
    DisplayImageNode,
    DisplayMediaNode,
    DisplayResourceCardNode
  ].forEach(registerNode);

  const ffmpegPath: string | undefined = getResourcePath('ffmpeg');
  const ffprobePath: string | undefined = getResourcePath('ffprobe');

  const engine = createEngine({ pluginResourceManager, ffmpegPath, ffprobePath });
  globalEngine = engine;
  // expose engine via closure only (no global)

  // Persist run updates
  const broadcast = (channel: string, payload: any): void => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    });
  };

  // 将 AI 相关事件转发到渲染进程（如缺少服务商配置时弹出窗口）
  // payload: { providerId: string; fields?: string[] }
  engine.on('ai:missing-provider', (payload: any) => {
    broadcast('wf:ai-missing-provider', payload);
  });

  // 将开始节点需要输入的事件转发到渲染进程
  // payload: { defId: string; inputMode: 'text' | 'url' | 'file'; metadata?: Record<string, any> }
  engine.on('wf:start-input-required', (payload: any) => {
    broadcast('wf:start-input-required', payload);
  });

  // 处理开始节点文件夹模式下的上下文更新请求
  // payload: { workspaceId: string; folderId: string; __runId: string }
  engine.on('wf:update-context', (payload: any) => {
    const runId: string | undefined = payload?.__runId;
    const workspaceId: string | undefined = payload?.workspaceId;
    const folderId: string | undefined = payload?.folderId;

    if (runId && workspaceId && folderId) {
      engine.updateRunContext(runId, {
        workspaceId,
        folderId
      });
      console.log('[workflow][wf:update-context] Updated workflow context', {
        runId,
        workspaceId,
        folderId
      });
    }
  });

  // 资源创建请求：由资源创建节点发出，由主进程适配层落盘到数据库
  // payload: { resourceData: any; callback?: (createdResource: any) => void }
  engine.on('resource:create-request', async (payload: any) => {
    console.log('resource:create-request');
    console.log(payload);

    try {
      const resourceData: Record<string, any> = payload?.resourceData || {};
      const callback = payload?.callback;
      if (!resourceData || typeof resourceData !== 'object' || (!resourceData.filePath && !resourceData.contentText)) {
        if (callback) callback(null);
        return;
      }

      // 验证必需字段：工作空间和文件夹
      if (!resourceData.workspaceId) {
        const error = new Error('资源创建失败：缺少工作空间 ID (workspaceId)');
        console.warn('[workflow][resource:create-request]', error.message);
        if (callback) callback(null);
        return;
      }
      if (!resourceData.folderId) {
        const error = new Error('资源创建失败：缺少文件夹 ID (folderId)');
        console.warn('[workflow][resource:create-request]', error.message);
        if (callback) callback(null);
        return;
      }

      console.log(resourceData);

      // 自动检测资源类型
      const filePath = resourceData.filePath;
      let detectedType = !resourceData.filePath && resourceData.contentText ? 'text' : 'file'; // 默认类型
      let mimeType: string | undefined;

      if (filePath) {
        const detected = detectBasicType(filePath);
        detectedType = detected.type || 'file';
        mimeType = detected.mimeType;

        // 检查是否是 document 类型（detectBasicType 不返回 'document'，需要单独判断）
        const ext = path.extname(filePath).toLowerCase();
        const DOC_EXT = new Set(['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.pdf', '.key', '.pages', '.numbers']);
        if (DOC_EXT.has(ext)) {
          detectedType = 'document';
          // 为 document 类型设置合适的 mimeType
          if (!mimeType) {
            const mimeMap: Record<string, string> = {
              '.pdf': 'application/pdf',
              '.doc': 'application/msword',
              '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              '.xls': 'application/vnd.ms-excel',
              '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              '.ppt': 'application/vnd.ms-powerpoint',
              '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            };
            mimeType = mimeMap[ext] || 'application/octet-stream';
          }
        }
      }

      // Create Resource
      const now = Date.now();
      const resource = {
        title: resourceData.title,
        filePath: resourceData.filePath,
        sizeBytes: resourceData.sizeBytes,
        description: resourceData.description,
        contentText: resourceData.contentText,
        type: detectedType,
        mimeType: mimeType,
        workspaceId: resourceData.workspaceId,
        folderId: resourceData.folderId,
        createdAt: now,
        updatedAt: now,
        collectedAt: resourceData.collectedAt || now,
        status: resourceData.status || 'new'
      };

      console.log('Detected resource type:', detectedType, 'mimeType:', mimeType);
      console.log(resource);

      try {
        const created = await ResourcesRepo.upsert(resource as any);
        if (created) {
          // 发送资源创建完成事件，与其他创建节点保持一致
          eventManager.emit(AppEvent.RESOURCE_CREATED, created);
        }
        if (callback) {
          callback(created || null);
        }
      } catch (e) {
        console.warn('[workflow][resource:create-request] failed:', e);
        if (callback) {
          callback(null);
        }
      }
    } catch (e) {
      console.warn('[workflow][resource:create-request] failed:', e);
      if (payload?.callback) {
        payload.callback(null);
      }
    }
  });

  // 资源更新请求：由资源更新节点发出，由主进程适配层落盘到数据库
  // payload: { resourceId: string; patch: any; callback?: (updatedResource: any) => void }
  engine.on('resource:update-request', async (payload: any) => {
    try {
      const resourceId: string = String(payload?.resourceId || '').trim();
      const patch: Record<string, any> = { ...(payload?.patch || {}) };
      const callback = payload?.callback;
      if (!resourceId || !patch || typeof patch !== 'object') {
        if (callback) callback(null);
        return;
      }

      const current = await ResourcesRepo.getById(resourceId);
      if (!current) {
        if (callback) callback(null);
        return;
      }

      // 如果本次更新包含文本内容，则同步更新 sizeBytes，保证纯文本资源也有合理的大小
      if (typeof patch.contentText === 'string') {
        try {
          const buf = Buffer.from(patch.contentText, 'utf8');
          patch.sizeBytes = buf.byteLength;
        } catch {
          // 忽略计算失败，不阻塞更新
        }
      }

      const updated = await ResourcesRepo.update(resourceId, patch as any);
      if (updated) {
        // 发送资源更新完成事件，与其他更新节点保持一致
        eventManager.emit(AppEvent.RESOURCE_UPDATED, updated);
      }
      if (callback) {
        callback(updated || null);
      }
    } catch (e) {
      console.warn('[workflow][resource:update-request] failed:', e);
      if (payload?.callback) {
        payload.callback(null);
      }
    }
  });

  // 资源下载请求：由资源创建节点发出，用于从URL下载文件到资源存储文件夹
  // payload: { url: string; workspaceId?: string; folderId?: string; callback?: (filePath: string | null, error?: string) => void }
  engine.on('resource:download-request', async (payload: any) => {
    try {
      const url: string = String(payload?.url || '').trim();
      const workspaceId: string | undefined = payload?.workspaceId ? String(payload.workspaceId) : undefined;
      const folderId: string | undefined = payload?.folderId ? String(payload.folderId) : undefined;
      const callback = payload?.callback;
      const runId: string | undefined = payload?.__runId; // 从事件 payload 中获取 runId

      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        if (callback) callback(null, '无效的URL');
        return;
      }

      // 获取工作空间
      let ws;
      if (workspaceId) {
        ws = await WorkspacesRepo.getById(workspaceId);
      } else {
        ws = await WorkspacesRepo.getDefault();
      }

      if (!ws || !ws.rootPath) {
        if (callback) callback(null, '无法获取工作空间路径');
        return;
      }

      // 确定目标文件夹
      let targetFolderId = folderId;
      if (!targetFolderId) {
        // 如果没有指定文件夹，使用当天文件夹
        try {
          const today = dayjs().format('YYYY-MM-DD');
          const siblings = await FoldersRepo.list({ workspaceId: ws.id, parentId: null, deletedAt: 0 } as any, 2000, 0);
          const existing = siblings.find((s: any) => s.name === today);
          if (existing) {
            targetFolderId = existing.id;
            // 如果找到了现有文件夹，也更新上下文（确保上下文是最新的）
            if (runId) {
              engine.updateRunContext(runId, {
                workspaceId: ws.id,
                folderId: existing.id
              });
            }
          } else {
            // 创建新文件夹
            const newFolder = {
              id: randomUUID(),
              name: today,
              parentId: null,
              workspaceId: ws.id,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            await FoldersRepo.upsert(newFolder as any);
            const dirPath = path.join(ws.rootPath, 'resources', 'folders', newFolder.id);
            fs.mkdirSync(dirPath, { recursive: true });
            targetFolderId = newFolder.id;

            // 如果创建了新文件夹，更新工作流的执行上下文
            if (runId) {
              engine.updateRunContext(runId, {
                workspaceId: ws.id,
                folderId: newFolder.id
              });
              console.log('[workflow][resource:download-request] Updated workflow context with new folder', {
                runId,
                workspaceId: ws.id,
                folderId: newFolder.id
              });
            }
          }
        } catch (e) {
          console.warn('[workflow][resource:download-request] Failed to ensure daily folder', e);
        }
      } else if (runId && workspaceId) {
        // 如果提供了 folderId，也更新上下文以确保一致性
        engine.updateRunContext(runId, {
          workspaceId: workspaceId,
          folderId: folderId
        });
      }

      // 确定目标目录
      let targetDir: string;
      if (targetFolderId) {
        targetDir = path.join(ws.rootPath, 'resources', 'folders', targetFolderId);
      } else {
        targetDir = path.join(ws.rootPath, 'resources');
      }
      fs.mkdirSync(targetDir, { recursive: true });

      // 从URL提取文件名
      let filename: string;
      try {
        const urlObj = new URL(url);
        const urlPathname = urlObj.pathname;
        filename = path.basename(urlPathname) || 'download';
        // 如果没有扩展名，尝试从Content-Type获取，这里简化处理
        if (!path.extname(filename)) {
          filename += '.tmp';
        }
      } catch {
        filename = 'download.tmp';
      }

      // 清理文件名中的非法字符
      filename = filename.replace(/[<>:"/\\|?*]/g, '_');

      // 处理同名文件
      let targetPath = path.join(targetDir, filename);
      const ext = path.extname(filename);
      const nameNoExt = path.basename(filename, ext);
      let counter = 1;
      while (fs.existsSync(targetPath)) {
        targetPath = path.join(targetDir, `${nameNoExt}(${counter})${ext}`);
        counter++;
      }

      // 使用 fetch 直接下载文件并保存
      // 设置浏览器请求头以避免 403 错误
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300000); // 5分钟超时

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive',
            Referer: new URL(url).origin,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site'
          }
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // 将响应流写入文件
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await fs.promises.writeFile(targetPath, buffer);

        console.log('[workflow][resource:download-request] File downloaded successfully', {
          url,
          targetPath,
          size: buffer.length
        });

        if (callback) {
          callback(targetPath);
        }
      } catch (downloadError) {
        console.warn('[workflow][resource:download-request] Download failed:', downloadError);
        if (callback) {
          callback(null, downloadError instanceof Error ? downloadError.message : String(downloadError));
        }
      }
    } catch (e) {
      console.warn('[workflow][resource:download-request] failed:', e);
      if (payload?.callback) {
        payload.callback(null, e instanceof Error ? e.message : String(e));
      }
    }
  });

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
      loadPresetWorkflows(getWorkflowDefinitionsPathFn())
        .then((preset) => {
          return WorkflowStore.list().then((custom) => {
            const allDefs = [...preset, ...custom];
            const def = allDefs.find((d) => d.id === rec.workflowId);
            if (def?.name) {
              const progress = workflowProgress.get(rec.runId);
              if (progress) {
                progress.workflowName = def.name;
                sendAppBusyProgress(
                  Math.round((Object.values(rec.nodes).filter((n) => n.status === 'completed' || n.status === 'failed' || n.status === 'skipped').length / totalNodes) * 100),
                  `执行工作流: ${def.name}`
                );
              }
            }
          });
        })
        .catch(() => { });
      workflowProgress.set(rec.runId, { totalNodes, workflowName });
      sendAppBusyStart(0, `执行工作流: ${workflowName}`);
    } else if ((rec.status === 'completed' || rec.status === 'failed' || rec.status === 'canceled') && workflowProgress.has(rec.runId)) {
      // 工作流结束
      const progress = workflowProgress.get(rec.runId);
      if (progress) {
        const statusText = rec.status === 'completed' ? '完成' : rec.status === 'failed' ? '失败' : '已取消';
        sendAppBusyProgress(100, `工作流${statusText}: ${progress.workflowName}`);
        sendAppBusyEnd();
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
        const preset = await loadPresetWorkflows(getWorkflowDefinitionsPathFn()).catch(() => []);
        const custom = await WorkflowStore.list().catch(() => []);
        const allDefs = [...preset, ...custom];
        const def = allDefs.find((d) => d.id === rec.workflowId);
        const nodeInstance = def?.nodes.find((n) => n.id === runningNode.nodeId);
        const nodeLabel = nodeInstance?.name || nodeInstance?.type || runningNode.nodeId;
        progressMessage = `${nodeLabel} 执行中`;
        sendAppBusyProgress(currentProgress, `执行工作流: ${progress.workflowName} - ${nodeLabel}`);
      } else {
        progressMessage = '执行中';
        sendAppBusyProgress(currentProgress, `执行工作流: ${progress.workflowName}`);
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
    loadPresetWorkflows(getWorkflowDefinitionsPathFn())
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

          sendAppBusyProgress(overallProgress, `执行工作流: ${workflowProg.workflowName} - ${progressMessage}`);
        });
      })
      .catch(() => {
        // 如果获取节点信息失败，使用默认消息
        const progressMessage = message || `${nodeId} 执行中`;
        sendAppBusyProgress(progress, `执行工作流: ${workflowProg.workflowName} - ${progressMessage}`);
      });
  });
  engine.onTyped('run:log', (runId, entry) => {
    broadcast('wf:run-log', { runId, entry });
  });

  // IPC endpoints
  ipcMain.handle('wf:listNodes', () =>
    listNodes().map((n) => {
      const spec = { ...n.spec };
      // 如果节点有 getConfig/getInputs/getOutputs 方法，标记为支持动态配置/动态端口
      if (n.getConfig) {
        spec.hasDynamicConfig = true;
      }
      if (n.getInputs) {
        spec.hasDynamicInputs = true;
      }
      if (n.getOutputs) {
        spec.hasDynamicOutputs = true;
      }
      return spec;
    })
  );
  ipcMain.handle('wf:getNodeConfig', async (_e, payload: { nodeId: string; config?: NodeConfig }) => {
    const handler = getNode(payload.nodeId);
    if (!handler) return { ok: false, error: 'Node not found' };
    // 如果节点有 getConfig 方法，使用它；否则使用 spec.config
    const config = handler.getConfig ? await Promise.resolve(handler.getConfig(payload.config)) : handler.spec.config;
    return { ok: true, config };
  });
  ipcMain.handle('wf:getNodeInputs', async (_e, payload: { nodeId: string; config?: NodeConfig }) => {
    const handler = getNode(payload.nodeId);
    if (!handler) return { ok: false, error: 'Node not found' };
    // 如果节点有 getInputs 方法，使用它；否则使用 spec.inputs
    const inputs = handler.getInputs ? handler.getInputs(payload.config) : handler.spec.inputs;
    return { ok: true, inputs };
  });
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
    const [preset, custom] = await Promise.all([loadPresetWorkflows(getWorkflowDefinitionsPathFn()), WorkflowStore.list()]);
    return [...preset, ...custom];
  });
  ipcMain.handle('wf:listPresets', async () => {
    // 只返回预设工作流（使用缓存）
    return loadPresetWorkflows(getWorkflowDefinitionsPathFn());
  });
  ipcMain.handle('wf:isPreset', async (_e, payload: { id: string }) => {
    // 检查工作流是否为预设工作流（使用缓存）
    const preset = await loadPresetWorkflows(getWorkflowDefinitionsPathFn());
    return preset.some((w) => w.id === payload.id);
  });
  ipcMain.handle('wf:getDefinition', async (_e, payload: { id: string }) => {
    // 先尝试从预设工作流中查找（使用缓存）
    const preset = await loadPresetWorkflows(getWorkflowDefinitionsPathFn());
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
    const preset = await loadPresetWorkflows(getWorkflowDefinitionsPathFn());
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
  ipcMain.handle('wf:getRun', async (_e, payload: { runId: string }) => {
    const run = engine.getRun(payload.runId);
    if (run) return run;
    return WorkflowStore.getRun(payload.runId);
  });
  ipcMain.handle('wf:listRuns', async (_e, payload?: { defId?: string; limit?: number; resourceId?: string; workspaceId?: string }) =>
    WorkflowStore.listRuns(payload?.defId, payload?.limit, payload?.resourceId, payload?.workspaceId)
  );
  ipcMain.handle('wf:deleteRun', async (_e, payload: { runId: string; workspaceId?: string }) => {
    await WorkflowStore.removeRun(payload.runId, payload.workspaceId);
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
