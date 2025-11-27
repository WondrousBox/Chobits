import React, { useCallback, useMemo, useRef, useState } from 'react';
import { TbChecks, TbDownload, TbFolderPlus, TbPlus } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { addResourcesFromSelectedFiles } from '../services/resourceService';
import { RichTextEditor } from './RichTextEditor';

type Props = {
  folderId?: string | null;
  workspaceId?: string | null;
  hideEditor?: boolean;
  onDone?: () => void; // called after upload/create actions to let parent reload
};

const ACTION_CONFIGS = [
  {
    key: 'addFile',
    Icon: TbPlus,
    title: '添加文件',
    description: '选择本地文件添加到当前文件夹',
    type: 'file'
  },
  {
    key: 'importFolder',
    Icon: TbDownload,
    title: '导入文件夹',
    description: '选择一个文件夹并导入内部所有文件',
    type: 'import'
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
  const [content, setContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const doAfter = useCallback(async () => {
    try {
      if (onDone) await onDone();
    } catch {
      /* noop */
    }
  }, [onDone]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const items = Array.from(files).map((f) => ({ name: f.name, path: (f as any).path || '', size: f.size, file: f }));
      try {
        await addResourcesFromSelectedFiles(items as any, {
          folderId: folderId || undefined,
          workspaceId: workspaceId || undefined
        });
        toast.success('文件已添加');
        await doAfter();
      } catch (err) {
        console.error('上传文件失败', err);
        toast.error('上传失败');
      }
    },
    [folderId, workspaceId, doAfter]
  );

  const onChooseFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      await handleFiles(e.target.files);
      // clear to allow selecting same file again
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleFiles]
  );

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

    if (!textToSave || textToSave === '<p></p>') {
      toast.error('请输入内容后再保存');
      return;
    }
    try {
      const now = Date.now();
      const res = await window.YUA.resource['resource:add']({
        resource: {
          type: 'text',
          title: textToSave.replace(/<[^>]+>/g, '').slice(0, 40) || 'New Note',
          contentText: textToSave,
          collectedAt: now,
          createdAt: now,
          updatedAt: now,
          status: 'new',
          ...(folderId ? { folderId } : {}),
          ...(workspaceId ? { workspaceId } : {})
        } as any
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
        onClick: item.type === 'file' ? onChooseFile : onCreateSubfolder
      })),
    [onChooseFile, onCreateSubfolder]
  );

  return (
    <div className="h-full w-full flex flex-col items-center justify-center">
      {!hideEditor && (
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="在此输入内容..."
          className="max-h-[calc(100vh-400px)] border min-w-[600px] border-solid rounded-lg box-border"
          style={{ width: 'calc(100% - 300px)' }}
          toolbarRight={
            <Button size="sm" variant="outline" onClick={onSaveText} disabled={!content || content === '<p></p>'} className="gap-1">
              <TbChecks className="h-4 w-4" /> 保存文本
            </Button>
          }
        />
      )}

      {/* Actions */}
      <div className="border-t bg-muted rounded-lg p-2 mt-2 min-w-[600px] box-border" style={{ width: 'calc(100% - 300px)' }}>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onInputChange} />
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
