import { AppEvent } from '@packages/event/events';
import type { OcrModelInfo, OcrRecognizeImageResult } from '@packages/ocr/types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { resolveModelFirstSelection } from '@/lib/ai-model-first';
import { runWorkflow as runWorkflowUtil } from '@/lib/workflow-runner';

import type { Resource } from '../../../electron/main/handlers/resource/ipc-renderer';
import RadialMenu, { RadialMenuItem } from '../../components/common/RadialMenu/RadialMenu';

type FileInfo = { name: string; path?: string; mime?: string };

type FileActionsMenuPayload = {
  files?: FileInfo[];
  resources?: Resource[];
  source?: string;
  correlationId?: string;
};

type ActionItem = {
  id: string;
  label: string;
  icon: string;
  run: () => Promise<void> | void;
};

type PluginDownloadProgressInfo = {
  pluginId?: string;
  resourceId?: string;
  name?: string;
  displayName?: string;
  status?: string;
  error?: string;
};

const PADDLE_OCR_PLUGIN_ID = 'plugin:paddle-ocr';
const DEFAULT_OCR_MODEL_NAME = 'ppocr-v6-small';
const DEFAULT_OCR_MODEL_DISPLAY_NAME = 'PP-OCRv6 Small';
const OCR_MODEL_INSTALL_TIMEOUT_MS = 30 * 60 * 1000;
const OCR_MODEL_INSTALL_POLL_MS = 1000;

class FileActionCancelledError extends Error {
  constructor(
    readonly reason: string,
    message: string
  ) {
    super(message);
    this.name = 'FileActionCancelledError';
  }
}

function mapFileActionPurposeEventToAppEvent(event: string): AppEvent | undefined {
  switch (event) {
    case 'fileAction:selected':
      return AppEvent.FILE_ACTION_SELECTED;
    case 'fileAction:workflow-started':
      return AppEvent.FILE_ACTION_WORKFLOW_STARTED;
    case 'fileAction:ocr-completed':
      return AppEvent.FILE_ACTION_OCR_COMPLETED;
    case 'fileAction:resolved':
      return AppEvent.FILE_ACTION_RESOLVED;
    case 'fileAction:failed':
      return AppEvent.FILE_ACTION_FAILED;
    case 'fileAction:cancelled':
      return AppEvent.FILE_ACTION_CANCELLED;
    default:
      return undefined;
  }
}

function extOf(name?: string): string {
  return (name?.split('.').pop() || '').toLowerCase();
}
function guessKind(file: FileInfo): 'doc' | 'audio' | 'video' | 'image' | 'pdf' | 'subtitle' | 'other' {
  const ext = extOf(file.name);
  const mime = (file.mime || '').toLowerCase();
  if (/docx?/.test(ext) || /word/.test(mime)) return 'doc';
  if (/(mp3|wav|m4a|flac|aac|ogg)$/i.test(ext) || /^audio\//.test(mime)) return 'audio';
  if (/(mp4|mov|mkv|webm|avi)$/i.test(ext) || /^video\//.test(mime)) return 'video';
  if (/(png|jpg|jpeg|webp|gif|bmp|tiff)$/i.test(ext) || /^image\//.test(mime)) return 'image';
  if (ext === 'pdf' || /pdf/.test(mime)) return 'pdf';
  if (/^(srt|vtt|ass)$/i.test(ext)) return 'subtitle';
  return 'other';
}

function parseJsonObject(value?: string): Record<string, unknown> {
  if (!value || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function getOcrText(result: OcrRecognizeImageResult): string {
  const text = result.text.trim();
  return text || '（未识别到文字）';
}

async function selectOcrModel(): Promise<OcrModelInfo | null> {
  const res = await window.YUA.ocr.listModels();
  if (!res.ok) {
    throw new Error(res.error || '无法读取 OCR 模型列表');
  }
  const models = res.data || [];
  return models.find((model) => model.name === 'ppocr-v6-small' && model.installed) || models.find((model) => model.installed) || null;
}

async function getPreferredOcrModelForDownload(): Promise<OcrModelInfo | null> {
  const res = await window.YUA.ocr.listModels();
  if (!res.ok) {
    throw new Error(res.error || '无法读取 OCR 模型列表');
  }
  const models = res.data || [];
  return models.find((model) => model.name === DEFAULT_OCR_MODEL_NAME) || models[0] || null;
}

async function waitForInstalledOcrModel(options: { resourceId?: string; modelName?: string; timeoutMs?: number } = {}): Promise<OcrModelInfo> {
  const timeoutMs = options.timeoutMs ?? OCR_MODEL_INSTALL_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    let checking = false;

    const cleanup = (): void => {
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      window.ipcRenderer?.off?.('plugin-resource:progress', progressListener as any);
    };

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const checkInstalled = async (): Promise<void> => {
      if (checking || settled) return;
      checking = true;
      try {
        const model = await selectOcrModel();
        if (model) {
          settle(() => resolve(model));
        }
      } catch (error) {
        settle(() => reject(error));
      } finally {
        checking = false;
      }
    };

    const progressListener = (_event: unknown, info?: PluginDownloadProgressInfo): void => {
      if (!info || info.pluginId !== PADDLE_OCR_PLUGIN_ID) return;
      const matchesTarget = !options.resourceId || info.resourceId === options.resourceId || info.name === options.modelName;
      if (!matchesTarget) return;

      if (info.status === 'installed') {
        void checkInstalled();
        return;
      }

      if (info.status === 'failed' || info.status === 'cancelled') {
        const label = info.displayName || options.modelName || DEFAULT_OCR_MODEL_DISPLAY_NAME;
        const reason = info.status === 'cancelled' ? '下载已取消' : info.error || '下载失败';
        settle(() => reject(new Error(`${label} ${reason}`)));
      }
    };

    window.ipcRenderer?.on?.('plugin-resource:progress', progressListener as any);
    const pollTimer = setInterval(() => void checkInstalled(), OCR_MODEL_INSTALL_POLL_MS);
    const timeoutTimer = setTimeout(() => {
      settle(() => reject(new Error('等待 OCR 模型安装超时')));
    }, timeoutMs);
    void checkInstalled();
  });
}

async function openPluginDownloadWindow(): Promise<void> {
  await window.YUA.window['window:open']('pluginDownload' as any);
}

async function requestOcrModelInstallConfirmation(model: OcrModelInfo | null): Promise<boolean> {
  const modelDisplayName = model?.displayName || DEFAULT_OCR_MODEL_DISPLAY_NAME;
  const result = await window.YUA.sprite.confirmNotice({
    content: `下载 ${modelDisplayName} 模型后才能识别图片文字。`,
    level: 'warning',
    confirmLabel: '下载模型',
    cancelLabel: '取消',
    timeoutMs: 5 * 60 * 1000
  });
  return result.confirmed;
}

const FileActionsMenu: React.FC = () => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [payloadMeta, setPayloadMeta] = useState<Omit<FileActionsMenuPayload, 'resources'>>({});
  const [menuOpen, setMenuOpen] = useState(true);
  const actionTakenRef = useRef(false);
  const primary = resources[0];
  const kind = primary ? guessKind({ name: primary.title || '', path: primary.filePath }) : 'other';

  useEffect(() => {
    // 接收主进程传来的文件数据
    const handler = (_: any, payload: any): void => {
      try {
        if (payload && typeof payload === 'object') {
          setPayloadMeta({
            files: Array.isArray(payload.files) ? (payload.files as FileInfo[]) : undefined,
            source: typeof payload.source === 'string' ? payload.source : undefined,
            correlationId: typeof payload.correlationId === 'string' ? payload.correlationId : undefined
          });
        }
        if (payload?.resources && Array.isArray(payload.resources)) {
          setResources(payload.resources as Resource[]);
        }
      } catch (err) {
        console.warn('[FileActionsMenu] failed to parse files from payload', err);
      }
    };
    window.ipcRenderer?.on('on:window:open:ready', handler);
    // 主动请求一次（若已经存在缓存）
    (async () => {
      try {
        const data = await window.YUA.window['window:payload:get']('fileActionsMenu' as any);
        if (data && typeof data === 'object') {
          setPayloadMeta({
            files: Array.isArray(data.files) ? (data.files as FileInfo[]) : undefined,
            source: typeof data.source === 'string' ? data.source : undefined,
            correlationId: typeof data.correlationId === 'string' ? data.correlationId : undefined
          });
        }
        if (data?.resources) setResources(data.resources as Resource[]);
      } catch (err) {
        console.warn('[FileActionsMenu] window:payload:get error', err);
      }
    })();
    return () => {
      try {
        window.ipcRenderer?.off('on:window:open:ready', handler as any);
      } catch (err) {
        console.warn('[FileActionsMenu] remove listener error', err);
      }
    };
  }, []);

  const emitPurposeEvent = useCallback(
    async (event: string, payload?: Record<string, unknown>): Promise<void> => {
      const eventPayload = {
        correlationId: payloadMeta.correlationId,
        source: payloadMeta.source,
        fileCount: payloadMeta.files?.length,
        resourceId: primary?.id,
        resourceIds: resources.map((resource) => resource.id).filter(Boolean),
        ...payload
      };
      try {
        await window.YUA.sprite.emitPurposeEvent({
          source: 'purpose-event',
          event,
          correlationId: payloadMeta.correlationId,
          payload: eventPayload
        });
      } catch (err) {
        console.warn('[FileActionsMenu] failed to emit purpose event', event, err);
      }

      const appEvent = mapFileActionPurposeEventToAppEvent(event);
      if (!appEvent) return;

      try {
        await window.YUA.sprite.emitPurposeEvent({
          source: 'app-event',
          event: appEvent,
          correlationId: payloadMeta.correlationId,
          payload: eventPayload
        });
      } catch (err) {
        console.warn('[FileActionsMenu] failed to emit app event', appEvent, err);
      }
    },
    [payloadMeta.correlationId, payloadMeta.files?.length, payloadMeta.source, primary?.id, resources]
  );

  const emitPurposeEventRef = useRef(emitPurposeEvent);
  useEffect(() => {
    emitPurposeEventRef.current = emitPurposeEvent;
  }, [emitPurposeEvent]);

  const closeWindow = useCallback(async (): Promise<void> => {
    try {
      await window.YUA.window['window:close']('fileActionsMenu' as any);
    } catch (err) {
      console.warn('[FileActionsMenu] close window error', err);
    }
  }, []);

  const resolveCancellation = useCallback(
    async (reason: string): Promise<void> => {
      if (actionTakenRef.current) {
        return;
      }
      actionTakenRef.current = true;
      await emitPurposeEvent('fileAction:cancelled', { reason });
      await emitPurposeEvent('fileAction:resolved', { outcome: 'cancelled', reason });
    },
    [emitPurposeEvent]
  );

  useEffect(() => {
    return () => {
      if (actionTakenRef.current) {
        return;
      }
      actionTakenRef.current = true;
      const emit = emitPurposeEventRef.current;
      void (async () => {
        await emit('fileAction:cancelled', { reason: 'menu-unmounted' });
        await emit('fileAction:resolved', { outcome: 'cancelled', reason: 'menu-unmounted' });
      })();
    };
  }, []);

  const handleClose = useCallback((): void => {
    void (async () => {
      if (actionTakenRef.current) {
        setMenuOpen(false);
        return;
      }
      await resolveCancellation('menu-closed');
      await closeWindow();
    })();
  }, [closeWindow, resolveCancellation]);

  const actions = useMemo<ActionItem[]>(() => {
    const list: ActionItem[] = [];
    const runWorkflow = async (defId: string, purpose: string, actionId: string): Promise<void> => {
      if (!primary) {
        console.warn(`[FileActionsMenu] no resource for ${purpose}`);
        await emitPurposeEvent('fileAction:failed', { reason: 'no-resource', actionId, actionPurpose: purpose, workflowId: defId });
        throw new Error('no-resource');
      }

      let runError: Error | null = null;
      await runWorkflowUtil({
        defId,
        input: { resource: primary, resourceId: primary.id },
        metadata: {
          resourceId: primary.id,
          resourceName: primary.title || 'Unknown',
          thumbnailPath: primary.thumbnailPath,
          workspaceId: primary.workspaceId,
          workflowName: purpose,
          actionId,
          actionPurpose: purpose
        },
        onSuccess: (runId) => {
          console.log(`[FileActionsMenu] ${purpose} started, runId:`, runId);
          void emitPurposeEvent('fileAction:workflow-started', {
            actionId,
            actionPurpose: purpose,
            workflowId: defId,
            workflowRunId: runId,
            runId
          });
        },
        onError: (error) => {
          console.warn(`[FileActionsMenu] ${purpose} failed`);
          runError = error instanceof Error ? error : new Error(String(error));
          void emitPurposeEvent('fileAction:failed', {
            actionId,
            actionPurpose: purpose,
            workflowId: defId,
            error: runError.message
          });
        }
      });
      if (runError) {
        throw runError;
      }
    };
    const closeAfter = async (actionId: string, fn: () => Promise<void> | void): Promise<void> => {
      let outcome = 'selected';
      try {
        await fn();
      } catch (err) {
        if (err instanceof FileActionCancelledError) {
          outcome = 'cancelled';
          await emitPurposeEvent('fileAction:cancelled', {
            actionId,
            reason: err.reason
          });
        } else {
          outcome = 'failed';
          await emitPurposeEvent('fileAction:failed', {
            actionId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      } finally {
        await emitPurposeEvent('fileAction:resolved', { actionId, outcome });
        await closeWindow();
      }
    };
    const summarizeDoc = (): Promise<void> =>
      closeAfter('doc-sum', async () => {
        // 资源已添加，打开助手窗口继续处理
        try {
          await window.YUA.window['window:open']('assistant' as any);
        } catch (err) {
          console.warn('[FileActionsMenu] open assistant error', err);
        }
      });
    const makeCards = (): Promise<void> =>
      closeAfter('doc-cards', async () => {
        try {
          await window.YUA.window['window:open']('assistant' as any);
        } catch (err) {
          console.warn('[FileActionsMenu] open assistant error', err);
        }
      });
    const transcribeAudio = (): Promise<void> =>
      closeAfter('audio-stt', async () => {
        await runWorkflow('sample:transcribe', 'audio transcription', 'audio-stt');
      });
    const convertAudio = (): Promise<void> =>
      closeAfter('audio-transcode', async () => {
        await runWorkflow('sample:transcode', 'audio transcode', 'audio-transcode');
      });
    const transcodeVideo = (): Promise<void> =>
      closeAfter('video-transcode', async () => {
        await runWorkflow('sample:transcode', 'video transcode', 'video-transcode');
      });
    const extractKeyframes = (): Promise<void> =>
      closeAfter('video-keyframes', async () => {
        await runWorkflow('sample:video-keyframes', 'video keyframes', 'video-keyframes');
      });

    const transcribeVideo = (): Promise<void> =>
      closeAfter('video-stt', async () => {
        await runWorkflow('sample:transcribe', 'video transcription', 'video-stt');
      });
    const analyzeImage = (): Promise<void> =>
      closeAfter('image-analyze', async () => {
        await runWorkflow('sample:image-understand', 'image understand', 'image-analyze');
      });
    const ocrImage = (): Promise<void> =>
      closeAfter('image-ocr', async () => {
        if (!primary?.id || !primary.filePath) {
          throw new Error('缺少可识别的图片资源');
        }

        let model = await selectOcrModel();
        if (!model) {
          const downloadModel = await getPreferredOcrModelForDownload();
          const confirmed = await requestOcrModelInstallConfirmation(downloadModel);
          if (!confirmed) {
            throw new FileActionCancelledError('ocr-model-download-cancelled', '已取消下载 OCR 模型');
          }

          const modelName = downloadModel?.name || DEFAULT_OCR_MODEL_NAME;
          const resourceId = downloadModel?.resourceId || modelName;
          const modelDisplayName = downloadModel?.displayName || DEFAULT_OCR_MODEL_DISPLAY_NAME;

          await emitPurposeEvent('fileAction:model-download-started', {
            actionId: 'image-ocr',
            pluginId: PADDLE_OCR_PLUGIN_ID,
            resourceId,
            modelName,
            modelDisplayName
          });

          const installResult = await window.YUA.pluginResource['plugin-resource:install']({
            pluginId: PADDLE_OCR_PLUGIN_ID,
            resourceId,
            deleteAfterInstall: true
          });
          await openPluginDownloadWindow();

          if (!installResult.ok) {
            throw new Error(installResult.error || 'OCR 模型下载任务创建失败');
          }

          toast.info('OCR 模型下载已开始', { description: `正在等待 ${modelDisplayName} 安装完成。` });
          model = await waitForInstalledOcrModel({ resourceId, modelName });
          await emitPurposeEvent('fileAction:model-download-completed', {
            actionId: 'image-ocr',
            pluginId: PADDLE_OCR_PLUGIN_ID,
            resourceId: model.resourceId,
            modelName: model.name,
            modelDisplayName: model.displayName
          });
          toast.success('OCR 模型已安装', { description: '继续识别图片文字。' });
        }

        toast.info('正在识别图片文字', { description: model.displayName });
        const result = await window.YUA.ocr.recognizeImage({
          imagePath: primary.filePath,
          model: model.name,
          strategy: 'per-box',
          processingEngine: 'opencv',
          maxSideLength: 640,
          flatten: true
        });
        console.info('[OCR] recognizeImage IPC result', {
          imagePath: primary.filePath,
          modelName: model.name,
          ok: result.ok,
          code: result.code,
          error: result.error,
          data: result.data
        });

        if (!result.ok || !result.data) {
          if (result.code === 'OCR_MODEL_MISSING') {
            toast.error('OCR 模型未安装或不完整', {
              description: result.error || '请在插件下载窗口重新下载模型。'
            });
            await openPluginDownloadWindow();
          }
          throw new Error(result.error || 'OCR 识别失败');
        }

        const recognizedText = getOcrText(result.data);
        const metadata = {
          ...parseJsonObject(primary.metadata),
          ocr: {
            engine: result.data.engine,
            modelName: result.data.modelName,
            modelDisplayName: result.data.modelDisplayName,
            confidence: result.data.confidence,
            results: result.data.results,
            updatedAt: Date.now()
          }
        };

        const updateResult = await window.YUA.resource['resource:update']({
          id: primary.id,
          patch: {
            contentText: recognizedText,
            metadata: JSON.stringify(metadata),
            status: 'ready'
          }
        });
        if (!updateResult.success) {
          throw new Error(updateResult.error || 'OCR 结果写回图片资源失败');
        }
        const updatedResource = (updateResult.data as Resource | undefined) || {
          ...primary,
          contentText: recognizedText,
          metadata: JSON.stringify(metadata),
          status: 'ready' as const
        };

        await emitPurposeEvent('fileAction:ocr-completed', {
          actionId: 'image-ocr',
          modelName: result.data.modelName,
          modelDisplayName: result.data.modelDisplayName,
          textLength: recognizedText.length
        });

        toast.success('OCR 识别完成', { description: '识别结果已保存到图片资源内容。' });
        await window.YUA.window['window:open']('resourcePreview', {
          current: updatedResource
        });
      });
    const parsePdf = (): Promise<void> =>
      closeAfter('pdf-parse', async () => {
        try {
          await window.YUA.window['window:open']('assistant' as any);
        } catch (err) {
          console.warn('[FileActionsMenu] open assistant error', err);
        }
      });

    const openSubtitlePreview = (): Promise<void> =>
      closeAfter('subtitle-view', async () => {
        if (!primary?.id) return;
        try {
          await window.YUA.window['window:open']('resourcePreview', {
            current: primary
          });
        } catch (err) {
          console.warn('[FileActionsMenu] open resourcePreview error', err);
        }
      });

    const translateSubtitle = (): Promise<void> =>
      closeAfter('subtitle-translate', async () => {
        if (!primary?.id) return;
        try {
          const STORAGE_KEY = 'subtitle-translator-preferences';
          const loadPreferences = (): Record<string, any> | null => {
            try {
              const stored = localStorage.getItem(STORAGE_KEY);
              if (stored) {
                return JSON.parse(stored);
              }
            } catch (error) {
              console.error('读取翻译偏好设置失败:', error);
            }
            return null;
          };

          const preferences = loadPreferences();
          const providerId = preferences?.selectedProviderId || '';
          const presetId = preferences?.selectedPresetId || '';
          const model = preferences?.selectedModel || '';
          const targetLanguage = preferences?.targetLanguage || 'en';
          const translationMode = preferences?.translationMode || 'ai';

          if (translationMode !== 'ai' || !providerId || !model) {
            console.warn('[FileActionsMenu] AI translation not configured, opening preview instead');
            await window.YUA.window['window:open']('resourcePreview', {
              current: primary
            });
            return;
          }

          const resolvedSelection = await resolveModelFirstSelection({
            providerId,
            modelId: model,
            preferredPresetId: presetId
          });
          if (!resolvedSelection) {
            console.warn('[FileActionsMenu] AI translation preset unavailable, opening preview instead');
            await window.YUA.window['window:open']('resourcePreview', {
              current: primary
            });
            return;
          }

          await window.YUA.ai.translate({
            providerId: resolvedSelection.providerId,
            providerPresetId: resolvedSelection.providerPresetId,
            model: resolvedSelection.modelId,
            resourceId: primary.id,
            targetLanguage,
            languageNames: {
              en: '英语',
              zh: '中文',
              ja: '日语',
              ko: '韩语',
              de: '德语',
              es: '西班牙语',
              ru: '俄语',
              fr: '法语',
              pt: '葡萄牙语',
              it: '意大利语',
              ar: '阿拉伯语',
              hi: '印地语',
              vi: '越南语',
              th: '泰语'
            },
            metadata: {
              resourceId: primary.id
            }
          });
        } catch (err) {
          console.warn('[FileActionsMenu] translate subtitle error', err);
        }
      });

    const readSubtitle = (): Promise<void> =>
      closeAfter('subtitle-read', async () => {
        if (!primary?.id) return;
        try {
          await window.YUA.window['window:open']('resourcePreview', {
            current: primary,
            action: 'read'
          });
        } catch (err) {
          console.warn('[FileActionsMenu] read subtitle error', err);
        }
      });

    const summarizeSubtitle = (): Promise<void> =>
      closeAfter('subtitle-summarize', async () => {
        if (!primary?.id) return;
        try {
          await window.YUA.window['window:open']('resourcePreview', {
            current: primary,
            action: 'summarize'
          });
        } catch (err) {
          console.warn('[FileActionsMenu] summarize subtitle error', err);
        }
      });

    if (kind === 'doc') {
      list.push({ id: 'doc-sum', label: '总结文档', icon: '📝', run: summarizeDoc });
      list.push({ id: 'doc-cards', label: '生成阅读卡片', icon: '🗂️', run: makeCards });
      // no explicit import action; resources are already added
    } else if (kind === 'audio') {
      list.push({ id: 'audio-stt', label: '识别文字（转写）', icon: '🗣️', run: transcribeAudio });
      list.push({ id: 'audio-transcode', label: '转码/压缩', icon: '🎛️', run: convertAudio });
      // already added
    } else if (kind === 'video') {
      list.push({ id: 'video-transcode', label: '转码/压缩', icon: '🎬', run: transcodeVideo });
      list.push({ id: 'video-keyframes', label: '提取关键帧', icon: '🖼️', run: extractKeyframes });
      list.push({ id: 'video-stt', label: '视频转写', icon: '🗣️', run: transcribeVideo });
      // already added
    } else if (kind === 'image') {
      list.push({ id: 'image-analyze', label: '图像理解', icon: '🧠', run: analyzeImage });
      list.push({ id: 'image-ocr', label: '文字识别（OCR）', icon: '🔎', run: ocrImage });
      // already added
    } else if (kind === 'pdf') {
      list.push({ id: 'pdf-parse', label: '解析/总结 PDF', icon: '📄', run: parsePdf });
      // already added
    } else if (kind === 'subtitle') {
      list.push({ id: 'subtitle-view', label: '查看字幕', icon: '📺', run: openSubtitlePreview });
      list.push({ id: 'subtitle-translate', label: '翻译字幕', icon: '🌐', run: translateSubtitle });
      list.push({ id: 'subtitle-read', label: '读给我听', icon: '🔊', run: readSubtitle });
      list.push({ id: 'subtitle-summarize', label: '总结字幕', icon: '📝', run: summarizeSubtitle });
      // already added
    } else {
      // generic: already added
    }
    return list;
  }, [closeWindow, emitPurposeEvent, kind, primary]);

  // Build radial menu items from available actions
  const radialItems: RadialMenuItem[] = useMemo(() => {
    return actions.map((a) => ({
      id: a.id,
      label: a.label,
      icon: a.icon,
      action: () => {
        actionTakenRef.current = true;
        setMenuOpen(false);
        void emitPurposeEvent('fileAction:selected', {
          actionId: a.id,
          actionLabel: a.label
        });
        void a.run();
      }
    }));
  }, [actions, emitPurposeEvent]);

  // If there are no actions yet (data not ready), don't render the menu
  if (radialItems.length === 0) return null;

  return <>{menuOpen && radialItems.length > 0 && <RadialMenu items={radialItems} open onClose={handleClose} />}</>;
};

export default FileActionsMenu;
