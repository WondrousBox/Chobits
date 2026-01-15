import type { RssSourceType } from '@main/handlers/rss/types';
import React, { useCallback, useState } from 'react';
import { TbBrandYoutube, TbLoader2, TbRss } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AddRssDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  workspaceId?: string;
  folderId?: string;
}

const AddRssDialog: React.FC<AddRssDialogProps> = ({ open, onOpenChange, onSuccess, workspaceId, folderId }) => {
  const [sourceType, setSourceType] = useState<RssSourceType>('youtube');
  const [channelInput, setChannelInput] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [autoDownload, setAutoDownload] = useState(false);
  const [downloadQuality, setDownloadQuality] = useState('1080p');
  const [adding, setAdding] = useState(false);

  // 重置表单
  const resetForm = useCallback(() => {
    setChannelInput('');
    setCustomTitle('');
    setAutoDownload(false);
    setDownloadQuality('1080p');
  }, []);

  // 添加订阅
  const handleAdd = useCallback(async () => {
    if (!channelInput.trim()) {
      toast.error('请输入频道地址或 RSS 链接');
      return;
    }

    setAdding(true);
    try {
      const result = await window.YUA.rss.create({
        sourceType,
        channelIdOrUrl: channelInput.trim(),
        title: customTitle.trim() || undefined,
        autoDownload,
        downloadQuality,
        folderId,
        workspaceId
      });

      if (result.success) {
        toast.success('订阅添加成功', { description: result.data?.title });
        resetForm();
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error('添加失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('添加失败', { description: error?.message });
    } finally {
      setAdding(false);
    }
  }, [sourceType, channelInput, customTitle, autoDownload, downloadQuality, folderId, workspaceId, resetForm, onOpenChange, onSuccess]);

  // 获取输入提示
  const getInputPlaceholder = useCallback(() => {
    switch (sourceType) {
      case 'youtube':
        return '例如: @channelname 或 https://www.youtube.com/@channelname';
      case 'podcast':
        return '播客 RSS 地址';
      case 'bilibili':
        return 'Bilibili UP主空间地址';
      default:
        return 'RSS/Atom Feed 地址';
    }
  }, [sourceType]);

  // 获取输入描述
  const getInputDescription = useCallback(() => {
    switch (sourceType) {
      case 'youtube':
        return '支持频道 ID、@用户名、频道 URL 等多种格式';
      case 'podcast':
        return '输入播客的 RSS Feed 地址';
      case 'bilibili':
        return '输入 UP 主的空间地址或 UID';
      default:
        return '输入任意 RSS 或 Atom Feed 地址';
    }
  }, [sourceType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TbRss className="w-5 h-5 text-orange-500" />
            添加订阅
          </DialogTitle>
          <DialogDescription>订阅频道或 RSS 源，自动获取最新内容</DialogDescription>
        </DialogHeader>

        <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as RssSourceType)} className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="youtube" className="flex items-center gap-1.5">
              <TbBrandYoutube className="w-4 h-4" />
              YouTube
            </TabsTrigger>
            <TabsTrigger value="podcast" className="flex items-center gap-1.5">
              <TbRss className="w-4 h-4" />
              播客
            </TabsTrigger>
            <TabsTrigger value="custom" className="flex items-center gap-1.5">
              <TbRss className="w-4 h-4" />
              自定义
            </TabsTrigger>
          </TabsList>

          <TabsContent value="youtube" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>频道地址</Label>
              <Input placeholder={getInputPlaceholder()} value={channelInput} onChange={(e) => setChannelInput(e.target.value)} />
              <p className="text-xs text-muted-foreground">{getInputDescription()}</p>
            </div>
          </TabsContent>

          <TabsContent value="podcast" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>RSS 地址</Label>
              <Input placeholder={getInputPlaceholder()} value={channelInput} onChange={(e) => setChannelInput(e.target.value)} />
              <p className="text-xs text-muted-foreground">{getInputDescription()}</p>
            </div>
          </TabsContent>

          <TabsContent value="custom" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Feed 地址</Label>
              <Input placeholder={getInputPlaceholder()} value={channelInput} onChange={(e) => setChannelInput(e.target.value)} />
              <p className="text-xs text-muted-foreground">{getInputDescription()}</p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-4 mt-4">
          {/* 自定义标题 */}
          <div className="space-y-2">
            <Label>自定义标题（可选）</Label>
            <Input placeholder="留空则自动获取" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} />
          </div>

          {/* 自动下载 */}
          <div className="flex items-center justify-between">
            <div>
              <Label>自动下载</Label>
              <p className="text-xs text-muted-foreground">自动下载新发布的内容</p>
            </div>
            <Switch checked={autoDownload} onCheckedChange={setAutoDownload} />
          </div>

          {/* 下载质量 */}
          {autoDownload && (
            <div className="space-y-2">
              <Label>下载质量</Label>
              <Select value={downloadQuality} onValueChange={setDownloadQuality}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">最佳质量</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="audio">仅音频</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleAdd} disabled={adding || !channelInput.trim()}>
            {adding ? (
              <>
                <TbLoader2 className="w-4 h-4 mr-2 animate-spin" />
                添加中...
              </>
            ) : (
              '添加订阅'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddRssDialog;
