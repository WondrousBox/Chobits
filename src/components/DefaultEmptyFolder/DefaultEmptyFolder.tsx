import React, { useCallback, useRef, useState } from 'react';
import { TbChecks, TbFilePlus, TbFolderPlus, TbUpload } from 'react-icons/tb';
import { toast } from 'sonner';

import { addResourcesFromDataTransfer, addResourcesFromSelectedFiles } from '@/components/AIAssistant/services/resourceService';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { Button } from '@/components/ui/button';

type Props = {
  folderId?: string | null;
  workspaceId?: string | null;
  onDone?: () => void; // called after upload/create actions to let parent reload
};

const DefaultEmptyFolder: React.FC<Props> = ({ folderId, workspaceId, onDone }) => {
  const [content, setContent] = useState('');
  const [dragOver, setDragOver] = useState(false);
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
        await addResourcesFromSelectedFiles(items as any);
        toast.success('文件已添加');
        await doAfter();
      } catch (err) {
        console.error('上传文件失败', err);
        toast.error('上传失败');
      }
    },
    [doAfter]
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

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      try {
        // try to use DataTransfer helper which handles entries and files
        await addResourcesFromDataTransfer(e.dataTransfer);
        toast.success('已添加拖拽的文件');
        await doAfter();
      } catch (err) {
        console.error('处理拖拽失败', err);
        toast.error('添加失败');
      }
    },
    [doAfter]
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
          status: 'new'
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
  }, [content, doAfter]);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-8">
      <div
        className={`group relative w-full max-w-3xl rounded-xl border bg-gradient-to-br from-background via-background to-muted/40 shadow-sm overflow-hidden transition-colors ${dragOver ? 'ring-2 ring-primary/60 bg-muted/30' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <TbFolderPlus className="h-5 w-5" />
              </span>
              空文件夹
            </h2>
            <p className="text-xs text-muted-foreground mt-1">当前文件夹为空，你可以创建子文件夹或直接添加文本 / 文件资源。</p>
          </div>
        </div>

        {/* Editor */}
        <div className="px-5 mt-4 mb-3">
          <div className="rounded-lg border bg-background/70 backdrop-blur-sm overflow-hidden">
            <RichTextEditor value={content} onChange={setContent} placeholder="在此输入内容..." className="min-h-[200px] border-0 rounded-none" />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">{dragOver ? '释放鼠标即可添加文件…' : '可拖拽文件到此区域，或使用下方按钮。'}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t bg-muted/20 px-5 py-4 flex flex-wrap gap-3 items-center justify-start">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onInputChange} />
          <Button size="sm" variant="default" onClick={onChooseFile} className="gap-1">
            <TbUpload className="h-4 w-4" /> 添加文件
          </Button>
          <Button size="sm" variant="outline" onClick={onSaveText} disabled={!content || content === '<p></p>'} className="gap-1">
            <TbChecks className="h-4 w-4" /> 保存文本
          </Button>
          <Button size="sm" variant="ghost" onClick={onCreateSubfolder} className="gap-1">
            <TbFilePlus className="h-4 w-4" /> 创建子文件夹
          </Button>
        </div>
      </div>
      {/* Small hint below */}
      <div className="mt-4 text-xs text-muted-foreground text-center max-w-2xl">支持拖拽多个文件；超过 50MB 自动切换分片上传。Markdown 支持表格、代码高亮与 GFM 扩展。</div>
    </div>
  );
};

export default DefaultEmptyFolder;
