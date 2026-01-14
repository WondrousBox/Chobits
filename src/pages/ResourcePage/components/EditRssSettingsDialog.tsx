import { clsx } from 'clsx';
import type { RssMetadata } from 'electron/main/handlers/rss/types';
import React, { useCallback, useEffect, useState } from 'react';
import { TbLoader2, TbRss, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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

const EditRssSettingsDialog: React.FC<EditRssSettingsDialogProps> = ({ open, onOpenChange, item, onSuccess, onDelete }) => {
  const [title, setTitle] = useState('');
  const [autoDownload, setAutoDownload] = useState(false);
  const [downloadQuality, setDownloadQuality] = useState('1080p');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 解析 metadata
  const metadata: RssMetadata = useState(() => {
    try {
      return JSON.parse(item?.metadata || '{}');
    } catch {
      return {};
    }
  })[0];

  // 当对话框打开或 item 变化时，更新表单数据
  useEffect(() => {
    if (open && item) {
      setTitle(item.title || '');
      setAutoDownload(metadata.autoDownload || false);
      setDownloadQuality(metadata.downloadQuality || '1080p');
      setEnabled(metadata.enabled !== false);
    }
  }, [open, item, metadata]);

  // 保存设置
  const handleSave = useCallback(async () => {
    if (!item) return;

    setSaving(true);
    try {
      const newMetadata: RssMetadata = {
        ...metadata,
        autoDownload,
        downloadQuality,
        enabled
      };

      const result = await window.YUA.rss.update({
        resourceId: item.id,
        updates: {
          title: title.trim() || undefined,
          metadata: JSON.stringify(newMetadata)
        }
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
  }, [item, title, autoDownload, downloadQuality, enabled, metadata, onOpenChange, onSuccess]);

  // 删除订阅
  const handleDelete = useCallback(async () => {
    if (!item) return;

    setDeleting(true);
    try {
      const result = await window.YUA.resource.deleteResources({ ids: [item.id] });

      if (result.ok || result.success) {
        toast.success('订阅已删除');
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
  }, [item, onOpenChange, onDelete]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TbRss className="w-5 h-5 text-orange-500" />
            订阅设置
          </DialogTitle>
          <DialogDescription>管理 RSS 订阅的设置和选项</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* 标题 */}
          <div className="space-y-2">
            <Label>订阅标题</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入订阅标题" />
          </div>

          {/* 启用状态 */}
          <div className="flex items-center justify-between">
            <div>
              <Label>启用订阅</Label>
              <p className="text-xs text-muted-foreground">关闭后将暂停获取此订阅的内容</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
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

        <DialogFooter className="mt-6 flex-col sm:flex-row gap-2">
          <Button variant="destructive" onClick={handleDelete} disabled={deleting || saving} className={clsx('sm:mr-auto', deleting && 'cursor-wait')}>
            {deleting ? (
              <>
                <TbLoader2 className="w-4 h-4 mr-2 animate-spin" />
                删除中...
              </>
            ) : (
              <>
                <TbTrash className="w-4 h-4 mr-2" />
                删除订阅
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
                  <TbLoader2 className="w-4 h-4 mr-2 animate-spin" />
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
