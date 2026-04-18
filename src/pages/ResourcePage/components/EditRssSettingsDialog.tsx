import type { RssMetadata } from '@main/handlers/rss/types';
import { clsx } from 'clsx';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbLoader2, TbRss, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { ResourceItem } from '../types';

interface EditRssSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ResourceItem | null;
  onSuccess?: () => void;
  onDelete?: () => void;
}

type RssDeleteResultData = {
  id: string;
  deletedFeedCount: number;
  deletedDownloadedResourceCount?: number;
  keptDownloadedResourceCount?: number;
};

const EditRssSettingsDialog: React.FC<EditRssSettingsDialogProps> = ({ open, onOpenChange, item, onSuccess, onDelete }) => {
  const [title, setTitle] = useState('');
  const [autoDownload, setAutoDownload] = useState(false);
  const [downloadQuality, setDownloadQuality] = useState('1080p');
  const [enabled, setEnabled] = useState(true);
  const [fetchInterval, setFetchInterval] = useState(60);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDownloadedResources, setDeleteDownloadedResources] = useState(false);

  const metadata: RssMetadata = useMemo(() => {
    try {
      return JSON.parse(item?.metadata || '{}');
    } catch {
      return {} as RssMetadata;
    }
  }, [item?.metadata]);

  useEffect(() => {
    if (!open || !item) return;

    setTitle(item.title || '');
    setAutoDownload(metadata.autoDownload || false);
    setDownloadQuality(metadata.downloadQuality || '1080p');
    setEnabled(metadata.enabled !== false);
    setFetchInterval(metadata.fetchInterval || 60);
    setDeleteDownloadedResources(false);
  }, [open, item, metadata]);

  const handleSave = useCallback(async () => {
    if (!item) return;

    setSaving(true);
    try {
      const result = await window.YUA.rss.update({
        id: item.id,
        title: title.trim() || undefined,
        enabled,
        autoDownload,
        downloadQuality,
        fetchInterval
      });

      if (result.success) {
        toast.success('设置已保存');
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error('保存失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('保存失败', { description: error?.message });
    } finally {
      setSaving(false);
    }
  }, [item, title, enabled, autoDownload, downloadQuality, fetchInterval, onOpenChange, onSuccess]);

  const handleDelete = useCallback(async () => {
    if (!item) return;

    if (deleteDownloadedResources) {
      const confirmed = window.confirm('这会同时删除该订阅下已下载的内容，且操作不可恢复。确定继续吗？');
      if (!confirmed) {
        return;
      }
    }

    setDeleting(true);
    try {
      const result = await window.YUA.rss.delete({
        id: item.id,
        hardDelete: true,
        deleteDownloadedResources
      });

      if (result.success) {
        const deleteStats =
          result.data && 'deletedFeedCount' in result.data ? (result.data as RssDeleteResultData) : undefined;

        if (deleteDownloadedResources) {
          const deletedCount = deleteStats?.deletedDownloadedResourceCount ?? 0;
          toast.success('订阅及已下载内容已删除', {
            description: deletedCount > 0 ? `同时删除了 ${deletedCount} 个已下载资源` : '没有关联的已下载资源需要删除'
          });
        } else {
          const keptCount = deleteStats?.keptDownloadedResourceCount ?? 0;
          toast.success('已取消订阅', {
            description: keptCount > 0 ? `已保留 ${keptCount} 个已下载资源` : '已下载内容会保留在资源库中'
          });
        }

        onOpenChange(false);
        onDelete?.();
      } else {
        toast.error('删除失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('删除失败', { description: error?.message });
    } finally {
      setDeleting(false);
    }
  }, [deleteDownloadedResources, item, onDelete, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TbRss className="h-5 w-5 text-orange-500" />
            订阅设置
          </DialogTitle>
          <DialogDescription>管理 RSS 订阅设置。默认删除只会移除订阅和缓存，已下载内容会保留在资源库中。</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>订阅标题</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入订阅标题" />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>启用订阅</Label>
              <p className="text-xs text-muted-foreground">关闭后将暂停获取这个订阅的新内容。</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>自动下载</Label>
              <p className="text-xs text-muted-foreground">自动下载新发布的内容。</p>
            </div>
            <Switch checked={autoDownload} onCheckedChange={setAutoDownload} />
          </div>

          {autoDownload ? (
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
          ) : null}

          <div className="space-y-2">
            <Label>检查间隔（分钟）</Label>
            <Input
              type="number"
              min={5}
              max={1440}
              value={fetchInterval}
              onChange={(e) => setFetchInterval(parseInt(e.target.value, 10) || 60)}
            />
          </div>

          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="rss-delete-downloaded-resources"
                checked={deleteDownloadedResources}
                onCheckedChange={(checked) => setDeleteDownloadedResources(checked === true)}
                disabled={saving || deleting}
                className="mt-0.5 border-destructive/50 data-[state=checked]:bg-destructive data-[state=checked]:text-destructive-foreground"
              />
              <div className="space-y-1">
                <Label htmlFor="rss-delete-downloaded-resources" className="cursor-pointer">
                  同时删除已下载内容
                </Label>
                <p className="text-xs text-muted-foreground">默认只会取消订阅并清理 RSS 缓存，已下载的内容会保留在资源库中。</p>
                {deleteDownloadedResources ? (
                  <p className="text-xs text-destructive">勾选后会连同该订阅下的已下载资源一起删除，执行后不可恢复。</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6 flex-col gap-2 sm:flex-row">
          <Button variant="destructive" onClick={handleDelete} disabled={deleting || saving} className={clsx('sm:mr-auto', deleting && 'cursor-wait')}>
            {deleting ? (
              <>
                <TbLoader2 className="mr-2 h-4 w-4 animate-spin" />
                删除中...
              </>
            ) : (
              <>
                <TbTrash className="mr-2 h-4 w-4" />
                {deleteDownloadedResources ? '删除订阅及已下载内容' : '删除订阅'}
              </>
            )}
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving || deleting} className={clsx(saving && 'cursor-wait')}>
              {saving ? (
                <>
                  <TbLoader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存设置'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditRssSettingsDialog;
