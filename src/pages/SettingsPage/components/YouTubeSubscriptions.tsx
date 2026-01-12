import React, { useCallback, useEffect, useState } from 'react';
import { TbCheck, TbLoader2, TbPlus, TbRefresh, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { SettingGroup, SettingItem } from './SettingComponents';

interface YouTubeSubscription {
  id: string;
  channelId: string;
  channelName: string;
  rssUrl: string;
  enabled: boolean;
  autoDownload: boolean;
  lastChecked?: number;
  lastVideoId?: string;
  createdAt: number;
  updatedAt: number;
}

const YouTubeSubscriptions: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<YouTubeSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newChannelInput, setNewChannelInput] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [autoDownload, setAutoDownload] = useState(true);
  const [adding, setAdding] = useState(false);

  // 加载订阅列表
  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.YUA.videoDownloader.getSubscriptions();
      if (result.success && result.data) {
        setSubscriptions(result.data);
      } else {
        toast.error('加载订阅失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('加载订阅失败', { description: error?.message || String(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  // 添加订阅
  const handleAddSubscription = useCallback(async () => {
    if (!newChannelInput.trim()) {
      toast.error('请输入频道 ID 或 URL');
      return;
    }

    setAdding(true);
    try {
      const result = await window.YUA.videoDownloader.addSubscription({
        channelIdOrUrl: newChannelInput.trim(),
        channelName: newChannelName.trim() || undefined,
        autoDownload
      });

      if (result.success && result.data) {
        toast.success('订阅添加成功');
        setDialogOpen(false);
        setNewChannelInput('');
        setNewChannelName('');
        setAutoDownload(true);
        await loadSubscriptions();
      } else {
        toast.error('添加订阅失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('添加订阅失败', { description: error?.message || String(error) });
    } finally {
      setAdding(false);
    }
  }, [newChannelInput, newChannelName, autoDownload, loadSubscriptions]);

  // 删除订阅
  const handleDeleteSubscription = useCallback(
    async (id: string) => {
      try {
        const result = await window.YUA.videoDownloader.deleteSubscription(id);
        if (result.success) {
          toast.success('订阅已删除');
          await loadSubscriptions();
        } else {
          toast.error('删除订阅失败', { description: result.error });
        }
      } catch (error: any) {
        toast.error('删除订阅失败', { description: error?.message || String(error) });
      }
    },
    [loadSubscriptions]
  );

  // 更新订阅
  const handleUpdateSubscription = useCallback(
    async (id: string, updates: Partial<YouTubeSubscription>) => {
      try {
        const result = await window.YUA.videoDownloader.updateSubscription(id, updates);
        if (result.success) {
          await loadSubscriptions();
        } else {
          toast.error('更新订阅失败', { description: result.error });
        }
      } catch (error: any) {
        toast.error('更新订阅失败', { description: error?.message || String(error) });
      }
    },
    [loadSubscriptions]
  );

  // 检查订阅
  const handleCheckSubscription = useCallback(
    async (id: string) => {
      setChecking(id);
      try {
        const result = await window.YUA.videoDownloader.checkSubscription(id);
        if (result.success) {
          toast.success('检查完成');
          await loadSubscriptions();
        } else {
          toast.error('检查订阅失败', { description: result.error });
        }
      } catch (error: any) {
        toast.error('检查订阅失败', { description: error?.message || String(error) });
      } finally {
        setChecking(null);
      }
    },
    [loadSubscriptions]
  );

  // 检查所有订阅
  const handleCheckAll = useCallback(async () => {
    setChecking('all');
    try {
      const result = await window.YUA.videoDownloader.checkAllSubscriptions();
      if (result.success) {
        toast.success('检查完成');
        await loadSubscriptions();
      } else {
        toast.error('检查订阅失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('检查订阅失败', { description: error?.message || String(error) });
    } finally {
      setChecking(null);
    }
  }, [loadSubscriptions]);

  // 格式化时间
  const formatTime = (timestamp?: number): string => {
    if (!timestamp) return '从未';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  return (
    <SettingGroup title="YouTube 频道订阅">
      <SettingItem
        title="订阅管理"
        description="订阅 YouTube 频道，自动获取和下载新视频"
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <TbPlus className="h-4 w-4 mr-1.5" />
                添加订阅
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加 YouTube 频道订阅</DialogTitle>
                <DialogDescription>输入频道 ID 或 URL 来订阅频道</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="channel-input">频道 ID 或 URL</Label>
                  <Input id="channel-input" placeholder="例如: UCxxxxx 或 https://www.youtube.com/channel/UCxxxxx" value={newChannelInput} onChange={(e) => setNewChannelInput(e.target.value)} />
                  <p className="text-xs text-muted-foreground">支持频道 ID、频道 URL 或 @username 格式</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel-name">频道名称（可选）</Label>
                  <Input id="channel-name" placeholder="例如: 我的频道" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="auto-download" checked={autoDownload} onCheckedChange={setAutoDownload} />
                  <Label htmlFor="auto-download" className="text-sm font-normal">
                    自动下载新视频
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleAddSubscription} disabled={adding || !newChannelInput.trim()}>
                  {adding ? (
                    <>
                      <TbLoader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      添加中...
                    </>
                  ) : (
                    '添加'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* 订阅列表 */}
      {loading ? (
        <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
          <TbLoader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">暂无订阅，点击上方按钮添加订阅</div>
      ) : (
        <>
          <div className="px-4 py-2 flex items-center justify-between border-b border-border">
            <span className="text-xs text-muted-foreground">共 {subscriptions.length} 个订阅</span>
            <Button variant="ghost" size="sm" onClick={handleCheckAll} disabled={checking === 'all'} className="h-8">
              {checking === 'all' ? <TbLoader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <TbRefresh className="h-4 w-4 mr-1.5" />}
              检查全部
            </Button>
          </div>
          {subscriptions.map((subscription) => (
            <SettingItem
              key={subscription.id}
              title={subscription.channelName}
              description={
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">频道 ID: {subscription.channelId}</div>
                  <div className="text-xs text-muted-foreground">最后检查: {formatTime(subscription.lastChecked)}</div>
                  {subscription.lastVideoId && <div className="text-xs text-muted-foreground">最新视频 ID: {subscription.lastVideoId}</div>}
                </div>
              }
              action={
                <div className="flex items-center gap-2">
                  <Switch checked={subscription.enabled} onCheckedChange={(checked) => handleUpdateSubscription(subscription.id, { enabled: checked })} />
                  <Button variant="ghost" size="sm" onClick={() => handleCheckSubscription(subscription.id)} disabled={checking === subscription.id} className="h-8 w-8">
                    {checking === subscription.id ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbRefresh className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteSubscription(subscription.id)} className="h-8 w-8">
                    <TbTrash className="h-4 w-4" />
                  </Button>
                </div>
              }
            >
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">自动下载</Label>
                  <Switch checked={subscription.autoDownload} onCheckedChange={(checked) => handleUpdateSubscription(subscription.id, { autoDownload: checked })} />
                </div>
                {subscription.enabled && subscription.autoDownload && (
                  <Badge variant="secondary" className="text-[10px]">
                    <TbCheck className="h-3 w-3 mr-1" />
                    已启用自动下载
                  </Badge>
                )}
              </div>
            </SettingItem>
          ))}
        </>
      )}
    </SettingGroup>
  );
};

export default YouTubeSubscriptions;
