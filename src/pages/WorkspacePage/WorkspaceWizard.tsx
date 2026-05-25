import type { Workspace } from '@main/handlers/workspace/ipc-renderer';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useRef, useState } from 'react';
import { TbArrowLeft, TbArrowRight, TbFolderOpen } from 'react-icons/tb';

import SuccessResult from '@/components/common/SuccessResult';
import TermWithTooltip from '@/components/common/TermWithTooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getTerm } from '@/lib/terms';

const WorkspaceWizard: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  // 数据就绪后再开始渲染（防止首次渲染出现面板切换动画闪烁）
  const [ready, setReady] = useState(false);
  const [name, setName] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [created, setCreated] = useState(false);
  const createdRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 } as any, limit: 100, offset: 0 });
        if (!mounted) return;
        setWorkspaces(list);
        if (list.length > 0) {
          // 如果已有工作空间，则直接展示创建表单（不显示快速面板，避免动画切换）
          setShowCreateForm(true);
        }
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreate = async (): Promise<void> => {
    const pick = await window.YUA.file['file:pickDir']({ allowCreate: true });
    if (pick.canceled || !pick.path) return;
    if (!name) {
      setHint('名称不能为空');
      return;
    }
    setBusy(true);
    setHint('');
    try {
      const res = await window.YUA.workspace['workspace:add']({
        workspace: {
          name: name,
          rootPath: pick.path,
          isDefault: workspaces.length ? 0 : 1,
          status: 'active'
        }
      });
      await handleCreateResult(res);
    } catch (e) {
      console.log(e);
      setHint('创建失败，请更换路径或稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const onQuickCreate = async (): Promise<void> => {
    setBusy(true);
    setHint('');
    try {
      const res = await window.YUA.workspace['workspace:quickStart']();
      await handleCreateResult(res);
    } catch (e) {
      console.log(e);
      setHint('创建失败，请更换路径或稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateResult = async (res: { success: boolean; data?: Workspace }): Promise<void> => {
    console.log(res);
    if (res.success && res.data) {
      if (workspaces.length === 0) await window.YUA.workspace['workspace:setDefault']({ id: res.data.id });
      createdRef.current = true;
      setCreated(true);
      // 300ms 动画 + 额外 1000ms 停留后关闭 (总 ~1300ms) 交由组件 autoClose 控制也可，这里保留旧逻辑以保持行为一致
      setTimeout(() => {
        window.YUA.window['window:close']('workspaceWizard');
      }, 2300);
    }
  };

  const onCreateNew = (): void => {
    setName('');
    setHint('');
    setShowCreateForm(true);
  };

  const onBack = (): void => {
    if (workspaces.length > 0) return; // cannot go back when existing workspaces present
    setHint('');
    setShowCreateForm(false);
  };

  const showQuickPanel = ready && workspaces.length === 0 && !showCreateForm;
  // 如果在数据就绪后直接展示表单（已有工作空间），禁用初始动画位移
  const formInitial = !ready || workspaces.length > 0 ? { x: 0, opacity: 1 } : { x: 80, opacity: 0 };

  // 成功后仅展示成功提示，不再展示其它内容
  if (created) {
    return (
      <div className="w-full h-full bg-background text-foreground overflow-hidden flex flex-col items-center justify-center select-none">
        <SuccessResult title="空间创建成功" description="即将关闭" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="w-full h-full bg-background text-foreground overflow-hidden relative flex items-center justify-center">
        <div className="text-xs text-muted-foreground select-none">加载中…</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full drag-region bg-background text-foreground overflow-hidden relative">
      <div className="h-32"></div>
      <div className="text-center relative">
        <div className="text-xl mb-2">
          🗂 创建
          <TermWithTooltip {...getTerm('workspace')} />
        </div>
        <div className="text-xs text-muted-foreground">工作空间将被用于集中存放数据</div>
        <div className="relative mt-4">
          {(showQuickPanel || showCreateForm) && (
            <AnimatePresence initial={false} mode="wait">
              {showQuickPanel && (
                <motion.div
                  key="quick"
                  className="absolute inset-0 flex flex-col justify-start"
                  initial={{ x: 80, opacity: 0 }}
                  animate={{ x: 0, opacity: 1, transition: { duration: 0.35 } }}
                  exit={{ x: -80, opacity: 0, transition: { duration: 0.18 } }}
                >
                  <div className="mt-6 w-80 no-drag flex flex-col gap-2 mx-auto">
                    <Button onClick={onQuickCreate} disabled={busy}>
                      快速开始 <TbArrowRight />
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={onCreateNew}>
                      创建新空间
                    </Button>
                  </div>
                </motion.div>
              )}
              {showCreateForm && (
                <motion.div
                  key="form"
                  className="absolute inset-0 flex flex-col justify-start"
                  initial={formInitial}
                  animate={{ x: 0, opacity: 1, transition: { duration: 0.35 } }}
                  exit={{ x: -80, opacity: 0, transition: { duration: 0.18 } }}
                >
                  <div className="mt-6 w-80 no-drag flex flex-col gap-2 mx-auto">
                    <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="空间名称" />
                    <div className="flex items-center gap-2">
                      {workspaces.length === 0 && (
                        <Button size="icon" variant={'outline'} disabled={busy} onClick={onBack}>
                          <TbArrowLeft />
                        </Button>
                      )}
                      <Button className="flex-1" onClick={handleCreate} disabled={busy || !name.trim()}>
                        <TbFolderOpen /> 创建空间
                      </Button>
                    </div>
                    <div className="pb-2">{hint && <div className="text-red-500 text-xs">{hint}</div>}</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceWizard;
