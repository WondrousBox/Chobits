import { useCallback, useEffect, useState } from 'react';
import { TbFolder, TbLoader2, TbPlayerPlay } from 'react-icons/tb';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type IncomingPayload = {
  defId: string;
  inputMode: 'text' | 'url' | 'file' | 'folder';
  metadata?: Record<string, any>;
};

const invoke = window.ipcRenderer.invoke;

type Folder = {
  id: string;
  name: string;
  parentId?: string | null;
  workspaceId?: string;
};

export default function WorkflowStartInputWindow(): JSX.Element {
  const [defId, setDefId] = useState<string>('');
  const [inputMode, setInputMode] = useState<'text' | 'url' | 'file' | 'folder'>('text');
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [filePath, setFilePath] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // 从窗口管理器获取 payload
  useEffect(() => {
    let mounted = true;
    const bootstrap = async (): Promise<void> => {
      try {
        const payload = (await window.YUA.window['window:payload:get']('workflowStartInput' as any)) as IncomingPayload | undefined;
        if (!mounted) return;
        if (!payload?.defId || !payload?.inputMode) {
          setLoading(false);
          return;
        }
        setDefId(payload.defId);
        setInputMode(payload.inputMode);
        setMetadata(payload.metadata || {});
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }

      // 通知主进程：窗口已准备就绪
      try {
        await window.YUA.window['window:open:ready']('workflowStartInput' as any);
      } catch {
        // ignore
      }
    };

    bootstrap().catch(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  // 加载文件夹列表（仅在文件夹模式下）
  useEffect(() => {
    if (inputMode !== 'folder' || loading) return;

    let mounted = true;
    const loadFolders = async (): Promise<void> => {
      setLoadingFolders(true);
      try {
        const folderAPI: any = window.YUA?.folder;
        if (!folderAPI) {
          if (mounted) setLoadingFolders(false);
          return;
        }

        // 获取默认工作空间
        const ws = await window.YUA.workspace['workspace:getDefault']();
        if (!ws?.id) {
          if (mounted) setLoadingFolders(false);
          return;
        }

        // 获取所有文件夹
        const folderList = await folderAPI['folder.list']({
          workspaceId: ws.id,
          deletedAt: 0
        });

        if (mounted) {
          setFolders(folderList || []);
        }
      } catch (err) {
        console.warn('load folders failed', err);
        if (mounted) {
          toast.error('加载文件夹列表失败');
        }
      } finally {
        if (mounted) setLoadingFolders(false);
      }
    };

    loadFolders();

    return () => {
      mounted = false;
    };
  }, [inputMode, loading]);

  const isValidUrl = (urlString: string): boolean => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (submitting) return;

    let input: Record<string, any> = {};
    if (inputMode === 'text') {
      if (!text.trim()) {
        toast.error('请输入文本内容');
        return;
      }
      input = { text: text.trim() };
    } else if (inputMode === 'url') {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) {
        toast.error('请输入链接地址');
        return;
      }
      if (!isValidUrl(trimmedUrl)) {
        toast.error('请输入有效的网址（以 http:// 或 https:// 开头）');
        return;
      }
      input = { url: trimmedUrl };
    } else if (inputMode === 'file') {
      if (!filePath.trim()) {
        toast.error('请选择文件');
        return;
      }
      input = { file: filePath.trim() };
    } else if (inputMode === 'folder') {
      if (!folderId.trim()) {
        toast.error('请选择文件夹');
        return;
      }
      // 从选中的文件夹对象中获取工作空间ID
      const selectedFolder = folders.find((f) => f.id === folderId.trim());
      if (!selectedFolder) {
        toast.error('无法找到选中的文件夹');
        return;
      }
      const selectedWorkspaceId = selectedFolder.workspaceId;
      if (!selectedWorkspaceId) {
        toast.error('选中的文件夹缺少工作空间ID');
        return;
      }
      input = { folderId: folderId.trim(), workspaceId: selectedWorkspaceId };
    }

    setSubmitting(true);
    try {
      const data = {
        // 保留原始 metadata 中的所有值（包括 workspaceId 和 folderId）
        ...metadata,
        // 添加输入模式相关的元数据
        ...(inputMode === 'text' ? { textLength: input.text?.length || 0 } : {}),
        ...(inputMode === 'url' ? { url: input.url } : {}),
        ...(inputMode === 'file' ? { filePath: input.file } : {}),
        ...(inputMode === 'folder' ? { folderId: input.folderId, workspaceId: input.workspaceId } : {})
      };

      console.log('data', data);

      const result = await invoke('wf:run', {
        defId,
        input,
        metadata: data
      });

      if (!result?.ok) {
        const description = result?.error || (result?.validation ? (typeof result.validation === 'string' ? result.validation : JSON.stringify(result.validation)) : '未知错误');
        toast.error('工作流执行失败', { description });
        return;
      }

      toast.success('工作流已开始执行');
      window.close();
    } catch (err: any) {
      toast.error('工作流执行失败', { description: err?.message || String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickFile = async (): Promise<void> => {
    try {
      const result = await window.YUA.file['file:pickFile']();
      if (!result.canceled && result.path) {
        setFilePath(result.path);
      }
    } catch (err: any) {
      toast.error('文件选择失败', { description: err?.message || String(err) });
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm">
        <span>载入中...</span>
      </div>
    );
  }

  if (!defId || !inputMode) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm">
        <span>缺少必要参数</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <DragAbleTitle title={<span>工作流输入</span>} />
      <div className="w-full h-[calc(100%-36px)] px-4 box-border flex flex-col">
        <div className="flex-1 py-4" style={{ width: 'calc(100% - 32px)' }}>
          {inputMode === 'text' && (
            <div className="space-y-3 box-border">
              <Label className="text-sm">文本内容</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="请输入文本..."
                className="min-h-[200px] resize-none"
                autoFocus
                disabled={submitting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void handleConfirm();
                  }
                }}
              />
            </div>
          )}

          {inputMode === 'url' && (
            <div className="space-y-3">
              <Label className="text-sm">链接地址</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full"
                autoFocus
                disabled={submitting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleConfirm();
                  }
                }}
              />
              {url.trim() && !isValidUrl(url.trim()) && <p className="text-sm text-destructive">请输入有效的网址（以 http:// 或 https:// 开头）</p>}
            </div>
          )}

          {inputMode === 'file' && (
            <div className="space-y-3">
              <Label className="text-sm">文件路径</Label>
              <div className="flex gap-2">
                <Input
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="请选择文件或输入文件路径"
                  className="flex-1"
                  autoFocus
                  disabled={submitting}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleConfirm();
                    }
                  }}
                />
                <Button variant="outline" size="sm" onClick={handlePickFile} disabled={submitting}>
                  选择文件
                </Button>
              </div>
            </div>
          )}

          {inputMode === 'folder' && (
            <div className="space-y-3">
              <Label className="text-sm">选择文件夹</Label>
              {loadingFolders ? (
                <div className="flex items-center justify-center py-8">
                  <TbLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">加载文件夹列表...</span>
                </div>
              ) : (
                <Select value={folderId} onValueChange={setFolderId} disabled={submitting}>
                  <SelectTrigger className="w-full" autoFocus>
                    <SelectValue placeholder="请选择文件夹" />
                  </SelectTrigger>
                  <SelectContent>
                    {folders.length === 0 ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">暂无可用文件夹</div>
                    ) : (
                      folders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          <div className="flex items-center gap-2">
                            <TbFolder className="h-4 w-4" />
                            <span>{folder.name}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pb-4">
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={
              submitting ||
              (inputMode === 'text' && !text.trim()) ||
              (inputMode === 'url' && (!url.trim() || !isValidUrl(url.trim()))) ||
              (inputMode === 'file' && !filePath.trim()) ||
              (inputMode === 'folder' && (!folderId.trim() || loadingFolders))
            }
          >
            {submitting ? (
              <>
                <TbLoader2 className="mr-2 h-4 w-4 animate-spin" />
                运行中...
              </>
            ) : (
              <>
                <TbPlayerPlay className="mr-2 h-4 w-4" />
                运行
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
