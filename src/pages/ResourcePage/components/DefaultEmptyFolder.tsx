import React, { useCallback, useMemo, useState } from 'react';
import { TbChecks, TbFile, TbFolder, TbFolderPlus, TbShield } from 'react-icons/tb';
import { toast } from 'sonner';

import { useEditorAIConfig } from '@/components/Editor';
import { Button } from '@/components/ui/button';

import { useFolderImport } from '../hooks/useFolderImport';
import { RichTextEditor } from './RichTextEditor';

type Props = {
  folderId?: string | null;
  workspaceId?: string | null;
  hideEditor?: boolean;
  onDone?: () => void; // called after upload/create actions to let parent reload
};

const ACTION_CONFIGS = [
  {
    key: 'importFiles',
    Icon: TbFile,
    title: '选择文件',
    description: '选择多个文件进行导入',
    type: 'importFiles'
  },
  {
    key: 'importFolders',
    Icon: TbFolder,
    title: '选择文件夹',
    description: '选择多个文件夹进行导入',
    type: 'importFolders'
  },
  {
    key: 'createFolder',
    Icon: TbFolderPlus,
    title: '创建文件夹',
    description: '在当前位置下创建新的文件夹',
    type: 'folder'
  }
];

const DefaultEmptyFolder: React.FC<Props> = ({ folderId, workspaceId, hideEditor, onDone }) => {
  const [hasSeenPrivacyNotice, setHasSeenPrivacyNotice] = useState(() => {
    return localStorage.getItem('privacy_notice_seen') === 'true';
  });

  const handleAcceptPrivacy = useCallback(() => {
    localStorage.setItem('privacy_notice_seen', 'true');
    setHasSeenPrivacyNotice(true);
  }, []);

  const [content, setContent] = useState('');

  // 使用 useEditorAIConfig 获取 AI 续写功能和配置组件
  const { handleAIComplete, AIConfigComponent } = useEditorAIConfig({
    defaultProviderId: 'deepseek',
    persist: true,
    aiOptions: {
      agentId: 'assistant',
      temperature: 0.7,
      maxTokens: 1000
    }
  });

  const doAfter = useCallback(async () => {
    try {
      if (onDone) await onDone();
    } catch {
      /* noop */
    }
  }, [onDone]);

  const { importFiles, importFolders } = useFolderImport({
    folderFilter: folderId || '',
    wsFilter: workspaceId || undefined,
    load: async () => {
      await doAfter();
    },
    loadFolders: async () => {
      await doAfter();
    },
    // 不显示 toast，由 ResourcePage 中的 useFolderImport 统一处理
    showSuccessToast: false
  });

  const onCreateSubfolder = useCallback(async () => {
    try {
      const d = new Date();
      const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const folderApi: any = (window as any).YUA?.folder;
      if (!folderApi || typeof folderApi['folder.create'] !== 'function') {
        toast.error('无法创建文件夹：缺少接口');
        return;
      }
      const res = await folderApi['folder.create']({ name, parentId: folderId ?? null, workspaceId: workspaceId || undefined });
      if ((res as any)?.success) {
        toast.success('子文件夹已创建');
        await doAfter();
      } else {
        toast.error('创建失败');
      }
    } catch (err) {
      console.error('create subfolder failed', err);
      toast.error('创建失败');
    }
  }, [folderId, workspaceId, doAfter]);

  const onSaveText = useCallback(async () => {
    const textToSave = content.trim();

    console.log(textToSave);

    if (!textToSave) {
      toast.error('请输入内容后再保存');
      return;
    }
    try {
      const res = await window.YUA.resource['resource:add']({
        resource: { contentText: textToSave, ...(folderId ? { folderId } : {}), ...(workspaceId ? { workspaceId } : {}) }
      });
      if (res?.success) {
        toast.success('文本已保存为资源');
        setContent('');
        await doAfter();
      } else {
        toast.error('保存失败');
      }
    } catch (err) {
      console.error('save text failed', err);
      toast.error('保存失败');
    }
  }, [content, doAfter, folderId, workspaceId]);

  const actionItems = useMemo(
    () =>
      ACTION_CONFIGS.map((item) => ({
        ...item,
        onClick: item.type === 'importFiles' ? importFiles : item.type === 'importFolders' ? importFolders : onCreateSubfolder
      })),
    [importFiles, importFolders, onCreateSubfolder]
  );

  if (!hasSeenPrivacyNotice) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
        <div className="bg-primary/10 p-6 rounded-full mb-6">
          <TbShield className="w-16 h-16 text-primary" />
        </div>
        <div className="text-muted-foreground max-w-md mb-8 leading-relaxed text-sm">所有数据都存储在本地设备上，请安心使用</div>
        <Button onClick={handleAcceptPrivacy}>立即体验</Button>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center relative">
      {!hideEditor && (
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="在此输入内容..."
          className="max-h-[calc(100vh-400px)] border min-w-[600px] border-solid rounded-lg box-border"
          style={{ width: 'calc(100% - 300px)' }}
          onAIComplete={handleAIComplete}
          toolbarRight={
            <div className="flex items-center gap-2">
              {AIConfigComponent}
              <Button size="sm" variant="outline" onClick={onSaveText} disabled={!content} className="gap-1">
                <TbChecks className="h-4 w-4" /> 保存文本
              </Button>
            </div>
          }
        />
      )}

      {/* Actions */}
      <div className="border-t bg-muted rounded-lg p-2 mt-2 min-w-[600px] box-border" style={{ width: 'calc(100% - 300px)' }}>
        <div className="grid grid-cols-3 gap-2">
          {actionItems.map((a) => (
            <button
              key={a.key}
              onClick={a.onClick}
              className="group relative flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-accent hover:shadow-md"
            >
              <div className="flex gap-2 items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <a.Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-sm">{a.title}</h3>
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DefaultEmptyFolder;
