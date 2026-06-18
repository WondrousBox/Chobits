import { AppEvent } from '@packages/event/events';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

function mapFileActionPurposeEventToAppEvent(event: string): AppEvent | undefined {
  switch (event) {
    case 'fileAction:selected':
      return AppEvent.FILE_ACTION_SELECTED;
    case 'fileAction:workflow-started':
      return AppEvent.FILE_ACTION_WORKFLOW_STARTED;
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

const FileActionsMenu: React.FC = () => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [payloadMeta, setPayloadMeta] = useState<Omit<FileActionsMenuPayload, 'resources'>>({});
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
    const closeAfter = async (fn: () => Promise<void> | void): Promise<void> => {
      let outcome = 'selected';
      try {
        await fn();
      } catch (err) {
        outcome = 'failed';
        await emitPurposeEvent('fileAction:failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      } finally {
        await emitPurposeEvent('fileAction:resolved', { outcome });
        await closeWindow();
      }
    };
    const summarizeDoc = (): Promise<void> =>
      closeAfter(async () => {
        // 资源已添加，打开助手窗口继续处理
        try {
          await window.YUA.window['window:open']('assistant' as any);
        } catch (err) {
          console.warn('[FileActionsMenu] open assistant error', err);
        }
      });
    const makeCards = (): Promise<void> =>
      closeAfter(async () => {
        try {
          await window.YUA.window['window:open']('assistant' as any);
        } catch (err) {
          console.warn('[FileActionsMenu] open assistant error', err);
        }
      });
    const transcribeAudio = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:transcribe', 'audio transcription', 'audio-stt');
      });
    const convertAudio = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:transcode', 'audio transcode', 'audio-transcode');
      });
    const transcodeVideo = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:transcode', 'video transcode', 'video-transcode');
      });
    const extractKeyframes = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:video-keyframes', 'video keyframes', 'video-keyframes');
      });

    const transcribeVideo = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:transcribe', 'video transcription', 'video-stt');
      });
    const analyzeImage = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:image-understand', 'image understand', 'image-analyze');
      });
    const ocrImage = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:ocr', 'image ocr', 'image-ocr');
      });
    const parsePdf = (): Promise<void> =>
      closeAfter(async () => {
        try {
          await window.YUA.window['window:open']('assistant' as any);
        } catch (err) {
          console.warn('[FileActionsMenu] open assistant error', err);
        }
      });

    const openSubtitlePreview = (): Promise<void> =>
      closeAfter(async () => {
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
      closeAfter(async () => {
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
      closeAfter(async () => {
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
      closeAfter(async () => {
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
  }, [closeWindow, emitPurposeEvent, kind, payloadMeta.correlationId, primary]);

  // Build radial menu items from available actions
  const radialItems: RadialMenuItem[] = useMemo(() => {
    return actions.map((a) => ({
      id: a.id,
      label: a.label,
      icon: a.icon,
      action: () => {
        actionTakenRef.current = true;
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

  return <RadialMenu items={radialItems} open onClose={handleClose} />;
};

export default FileActionsMenu;
