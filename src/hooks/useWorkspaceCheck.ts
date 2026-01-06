import { useEffect } from 'react';

/**
 * useWorkspaceCheck
 * - 负责：应用启动时检查工作区是否存在，如果不存在则打开工作区向导
 * - 场景：应用级别，在 App 组件挂载时调用一次
 */
export function useWorkspaceCheck(): void {
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await new Promise((r) => setTimeout(r, 600));
        if (!mounted) return;
        const list = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 } as any, limit: 1, offset: 0 });
        if (!mounted) return;
        if (!Array.isArray(list) || list.length === 0) {
          window.YUA.window['window:open']('workspaceWizard');
        }
      } catch {
        /* noop */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
}
