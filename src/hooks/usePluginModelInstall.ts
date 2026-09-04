import { useCallback, useEffect, useRef, useState } from 'react';

export type ModelInstallStatus = 'idle' | 'installing' | 'installed' | 'failed' | 'cancelled';

export interface ModelInstallState {
  status: ModelInstallStatus;
  /** 安装记录 ID（取消安装时使用） */
  recordId?: string;
  progressBytes?: number;
  sizeBytes?: number;
  speedBps?: number;
  error?: string;
}

const ACTIVE_STATUSES = ['queued', 'downloading', 'extracting', 'verifying'];

const IDLE_STATE: ModelInstallState = { status: 'idle' };

/**
 * 跟踪单个插件模型资源的一键安装流程。
 * 复用插件资源管理器的 install / cancel / progress 事件机制（同 PluginPage）。
 */
export function usePluginModelInstall(
  resourceId: string | undefined,
  pluginId: string = 'plugin:sherpa-onnx'
): {
  state: ModelInstallState;
  install: () => Promise<void>;
  cancel: () => Promise<void>;
} {
  // state 携带归属的 resourceId，切换目标资源时自然回退到 idle，无需重置 effect
  const [innerState, setInnerState] = useState<(ModelInstallState & { forId: string }) | null>(null);
  const state = innerState && innerState.forId === resourceId ? innerState : IDLE_STATE;
  const recordIdRef = useRef<string | undefined>(undefined);
  const installingRef = useRef(false);

  // 订阅安装进度事件
  useEffect(() => {
    if (!resourceId) return undefined;

    const listener = (info: any): void => {
      if (!info || info.resourceId !== resourceId) return;
      if (info.id) recordIdRef.current = info.id;

      if (ACTIVE_STATUSES.includes(info.status)) {
        setInnerState({
          forId: resourceId,
          status: 'installing',
          recordId: info.id,
          progressBytes: info.doneBytes,
          sizeBytes: info.totalBytes,
          speedBps: info.speedBps
        });
      } else if (info.status === 'installed') {
        installingRef.current = false;
        setInnerState({ forId: resourceId, status: 'installed', recordId: info.id });
      } else if (info.status === 'failed') {
        installingRef.current = false;
        setInnerState({ forId: resourceId, status: 'failed', recordId: info.id, error: info.error });
      } else if (info.status === 'cancelled') {
        installingRef.current = false;
        setInnerState({ forId: resourceId, status: 'cancelled', recordId: info.id });
      }
    };

    return window.chobits.pluginResource.onProgress(listener);
  }, [resourceId]);

  const install = useCallback(async (): Promise<void> => {
    if (!resourceId || installingRef.current) return;
    installingRef.current = true;
    setInnerState({ forId: resourceId, status: 'installing', progressBytes: 0 });
    try {
      const res = await window.chobits.pluginResource['plugin-resource:install']({ pluginId, resourceId, deleteAfterInstall: true });
      if (res.ok && res.data?.id) {
        recordIdRef.current = res.data.id;
        setInnerState((prev) => (prev ? { ...prev, recordId: res.data.id } : prev));
      } else if (!res.ok) {
        installingRef.current = false;
        setInnerState({ forId: resourceId, status: 'failed', error: res.error || '安装失败' });
      }
    } catch (error) {
      installingRef.current = false;
      setInnerState({ forId: resourceId, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }, [pluginId, resourceId]);

  const cancel = useCallback(async (): Promise<void> => {
    const recordId = recordIdRef.current;
    if (!recordId) return;
    await window.chobits.pluginResource['plugin-resource:cancel']({ id: recordId });
  }, []);

  return { state, install, cancel };
}
