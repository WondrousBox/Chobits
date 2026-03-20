import React, { useEffect, useMemo, useState } from 'react';

import { runWorkflow as runWorkflowUtil } from '@/lib/workflow-runner';

import { Resource } from '../../../electron/main/handlers/resource/ipc-renderer';
import RadialMenu, { RadialMenuItem } from '../../components/common/RadialMenu/RadialMenu';

type FileInfo = { name: string; path?: string; mime?: string };

type ActionItem = {
  id: string;
  label: string;
  icon: string;
  run: () => Promise<void> | void;
};

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
  const primary = resources[0];
  const kind = primary ? guessKind({ name: primary.title || '', path: primary.filePath }) : 'other';

  useEffect(() => {
    // 接收主进程传来的文件数据
    const handler = (_: any, payload: any): void => {
      try {
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

  const actions = useMemo<ActionItem[]>(() => {
    const list: ActionItem[] = [];
    const runWorkflow = async (defId: string, purpose: string): Promise<void> => {
      if (!primary) {
        console.warn(`[FileActionsMenu] no resource for ${purpose}`);
        return;
      }

      await runWorkflowUtil({
        defId,
        input: { resource: primary, resourceId: primary.id },
        metadata: {
          resourceId: primary.id,
          resourceName: primary.title || 'Unknown',
          thumbnailPath: primary.thumbnailPath,
          workspaceId: primary.workspaceId
        },
        onSuccess: (runId) => {
          console.log(`[FileActionsMenu] ${purpose} started, runId:`, runId);
        },
        onError: () => {
          console.warn(`[FileActionsMenu] ${purpose} failed`);
        }
      });
    };
    const closeAfter = async (fn: () => Promise<void> | void): Promise<void> => {
      try {
        await fn();
      } finally {
        try {
          await window.YUA.window['window:close']('fileActionsMenu' as any);
        } catch (err) {
          console.warn('[FileActionsMenu] close window error', err);
        }
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
        await runWorkflow('sample:transcribe', 'audio transcription');
      });
    const convertAudio = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:audio-compress', 'audio transcode');
      });
    const transcodeVideo = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:transcode', 'video transcode');
      });
    const extractKeyframes = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:video-keyframes', 'video keyframes');
      });

    const transcribeVideo = (): Promise<void> =>
      closeAfter(async () => {
        await runWorkflow('sample:transcribe', 'video transcription');
      });
    const analyzeImage = (): Promise<void> =>
      closeAfter(async () => {
        try {
          await window.YUA.window['window:open']('assistant' as any);
        } catch (err) {
          console.warn('[FileActionsMenu] open assistant error', err);
        }
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

          if (translationMode !== 'ai' || !providerId || !presetId) {
            console.warn('[FileActionsMenu] AI translation not configured, opening preview instead');
            await window.YUA.window['window:open']('resourcePreview', {
              current: primary
            });
            return;
          }

          await window.YUA.ai.translate({
            providerId,
            providerPresetId: presetId,
            model,
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
  }, [kind, primary]);

  // Build radial menu items from available actions
  const radialItems: RadialMenuItem[] = useMemo(() => {
    return actions.map((a) => ({ id: a.id, label: a.label, icon: a.icon, action: () => a.run() }));
  }, [actions]);

  // If there are no actions yet (data not ready), don't render the menu
  if (radialItems.length === 0) return null;

  return <RadialMenu items={radialItems} open onClose={() => window.YUA.window['window:close']('fileActionsMenu' as any)} />;
};

export default FileActionsMenu;
