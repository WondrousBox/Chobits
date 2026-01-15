import type { RssFeed, RssFeedItem, RssMetadata } from '@main/handlers/rss/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbArrowLeft, TbCheck, TbClock, TbDownload, TbExternalLink, TbEye, TbHistory, TbLoader2, TbPlayerPlay, TbRefresh, TbRss, TbSearch, TbSettings, TbUsers } from 'react-icons/tb';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { makeResSrc } from './utils/resourceProtocol';

interface RssResourceInfo {
  id: string;
  title?: string;
  description?: string;
  previewUrl?: string;
  thumbnailPath?: string;
  metadata?: string;
  url?: string;
  favorite?: number;
}

const RssFeedPage: React.FC = () => {
  const { resourceId } = useParams<{ resourceId: string }>();
  const navigate = useNavigate();

  const [resource, setResource] = useState<RssResourceInfo | null>(null);
  const [feed, setFeed] = useState<RssFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadingItems, setDownloadingItems] = useState<Set<string>>(new Set());
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  // 解析 metadata
  const metadata: RssMetadata = useMemo(() => {
    try {
      return JSON.parse(resource?.metadata || '{}');
    } catch {
      return {} as RssMetadata;
    }
  }, [resource?.metadata]);

  // 设置表单状态
  const [settingsForm, setSettingsForm] = useState({
    enabled: true,
    autoDownload: false,
    downloadQuality: '1080p',
    fetchInterval: 60
  });

  // 加载资源信息
  const loadResource = useCallback(async () => {
    if (!resourceId) return;
    try {
      const res = await window.YUA.resource['getResource']({ id: resourceId });
      if (res) {
        setResource(res as RssResourceInfo);
        // 初始化设置表单
        try {
          const meta = JSON.parse(res.metadata || '{}');
          setSettingsForm({
            enabled: meta.enabled !== false,
            autoDownload: meta.autoDownload || false,
            downloadQuality: meta.downloadQuality || '1080p',
            fetchInterval: meta.fetchInterval || 60
          });
        } catch {
          // ignore parse error
        }
      }
    } catch (error) {
      console.error('加载资源失败:', error);
    }
  }, [resourceId]);

  // 加载 Feed 内容
  const loadFeed = useCallback(
    async (forceRefresh = false) => {
      if (!resourceId) return;
      setLoading(true);
      try {
        const result = await window.YUA.rss.fetchFeed({
          resourceId,
          forceRefresh
        });
        if (result.success && result.data) {
          setFeed(result.data);
        } else {
          toast.error('加载失败', { description: result.error });
        }
      } catch (error: any) {
        toast.error('加载失败', { description: error?.message });
      } finally {
        setLoading(false);
      }
    },
    [resourceId]
  );

  // 刷新 Feed
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed(true);
    setRefreshing(false);
    toast.success('刷新成功');
  }, [loadFeed]);

  // 加载历史视频（仅 YouTube）
  // 获取到的数据会自动存入数据库，下次进入页面时会从缓存加载
  const handleLoadHistory = useCallback(
    async (limit: number = 50) => {
      if (!resourceId || metadata.sourceType !== 'youtube') return;

      if (!hasMoreHistory) {
        toast.info('没有更多历史视频了');
        return;
      }

      setLoadingHistory(true);
      try {
        const result = await window.YUA.rss.fetchYouTubeHistory({
          resourceId,
          limit,
          offset: historyOffset
        });

        if (result.success && result.data) {
          const { items, hasMore, nextOffset, totalLoaded } = result.data;

          if (items.length > 0) {
            // 数据已自动存入数据库，重新加载 feed 以获取最新数据
            await loadFeed(false);
            setHistoryOffset(nextOffset);
            setHasMoreHistory(hasMore);
            toast.success(`已加载 ${items.length} 个历史视频，共 ${totalLoaded} 条`);
          } else {
            setHasMoreHistory(false);
            toast.info('没有更多历史视频了');
          }
        } else {
          toast.error('加载失败', { description: result.error });
        }
      } catch (error: any) {
        toast.error('加载历史失败', { description: error?.message });
      } finally {
        setLoadingHistory(false);
      }
    },
    [resourceId, metadata.sourceType, historyOffset, hasMoreHistory, loadFeed]
  );

  // 下载单个条目
  const handleDownloadItem = useCallback(
    async (item: RssFeedItem) => {
      if (!resourceId) return;

      setDownloadingItems((prev) => new Set(prev).add(item.id));

      try {
        const result = await window.YUA.rss.downloadItem({
          rssResourceId: resourceId,
          itemId: item.id,
          itemUrl: item.link
        });

        if (result.success && result.data) {
          // 调用视频下载器
          const downloadResult = await window.YUA.videoDownloader.downloadVideo({
            url: result.data.url,
            quality: parseInt(result.data.quality) || undefined
          });

          if (downloadResult) {
            toast.success('开始下载', { description: item.title });
          } else {
            toast.error('下载失败');
          }
        } else {
          toast.error('下载失败', { description: result.error });
        }
      } catch (error: any) {
        toast.error('下载失败', { description: error?.message });
      } finally {
        setDownloadingItems((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [resourceId]
  );

  // 保存设置
  const handleSaveSettings = useCallback(async () => {
    if (!resourceId) return;
    try {
      const result = await window.YUA.rss.update({
        id: resourceId,
        enabled: settingsForm.enabled,
        autoDownload: settingsForm.autoDownload,
        downloadQuality: settingsForm.downloadQuality,
        fetchInterval: settingsForm.fetchInterval
      });

      if (result.success) {
        toast.success('设置已保存');
        setSettingsOpen(false);
        loadResource();
      } else {
        toast.error('保存失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('保存失败', { description: error?.message });
    }
  }, [resourceId, settingsForm, loadResource]);

  // 过滤内容（feed?.items 现在包含 RSS + 已加载的历史数据）
  const filteredItems = useMemo(() => {
    const items = feed?.items || [];
    if (items.length === 0) return [];
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) => item.title.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query) || item.author?.toLowerCase().includes(query));
  }, [feed?.items, searchQuery]);

  // 是否为 YouTube 订阅
  const isYouTube = metadata.sourceType === 'youtube';

  // 格式化时间
  const formatTime = useCallback((timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;

    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
    if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`;

    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }, []);

  // 格式化时长
  const formatDuration = useCallback((ms?: number): string => {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }, []);

  // 格式化数字
  const formatNumber = useCallback((num?: number): string => {
    if (!num) return '';
    if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`;
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }, []);

  // 获取封面图
  const coverUrl = useMemo(() => {
    if (resource?.thumbnailPath) return makeResSrc(resource.thumbnailPath);
    if (resource?.previewUrl) return resource.previewUrl;
    if (metadata.avatarUrl) return metadata.avatarUrl;
    return null;
  }, [resource, metadata]);

  // 初始化加载
  useEffect(() => {
    loadResource();
    loadFeed();
  }, [loadResource, loadFeed]);

  // 当 metadata 变化时，同步历史分页位置
  useEffect(() => {
    if (metadata.historyLoadedCount) {
      setHistoryOffset(metadata.historyLoadedCount);
    }
  }, [metadata.historyLoadedCount]);

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* 顶部导航栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card/50 backdrop-blur-sm">
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => navigate(-1)}>
          <TbArrowLeft className="w-4 h-4" />
        </Button>

        {/* 订阅信息 */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
              <TbRss className="w-5 h-5 text-orange-500" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-medium text-sm truncate">{resource?.title || '加载中...'}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {metadata.subscriberCount && (
                <span className="flex items-center gap-1">
                  <TbUsers className="w-3 h-3" />
                  {formatNumber(metadata.subscriberCount)}
                </span>
              )}
              {feed?.totalItems && (
                <span className="flex items-center gap-1">
                  <TbRss className="w-3 h-3" />
                  {feed.totalItems} 条{metadata.historyLoadedCount ? ` (含历史)` : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? <TbLoader2 className="w-4 h-4 animate-spin" /> : <TbRefresh className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新</TooltipContent>
          </Tooltip>

          {isYouTube && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => handleLoadHistory(100)} disabled={loadingHistory}>
                  {loadingHistory ? <TbLoader2 className="w-4 h-4 animate-spin" /> : <TbHistory className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>加载历史视频</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setSettingsOpen(true)}>
                <TbSettings className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>订阅设置</TooltipContent>
          </Tooltip>

          {(metadata.channelUrl || resource?.url) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => window.open(metadata.channelUrl || resource?.url, '_blank')}>
                  <TbExternalLink className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>打开原始页面</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="px-4 py-2 border-b">
        <div className="relative">
          <TbSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="搜索内容..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {/* 内容列表 */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <TbLoader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <TbRss className="w-12 h-12 mb-2" />
            <p>{searchQuery ? '没有找到匹配的内容' : '暂无内容'}</p>
          </div>
        ) : (
          <div className="p-4 grid gap-3">
            {filteredItems.map((item) => (
              <FeedItemCard
                key={item.id}
                item={item}
                downloading={downloadingItems.has(item.id)}
                onDownload={() => handleDownloadItem(item)}
                formatTime={formatTime}
                formatDuration={formatDuration}
                formatNumber={formatNumber}
              />
            ))}

            {/* 加载历史按钮（仅 YouTube） */}
            {isYouTube && !searchQuery && (
              <div className="flex flex-col items-center gap-2 py-4">
                {hasMoreHistory ? (
                  <Button variant="outline" size="sm" onClick={() => handleLoadHistory(50)} disabled={loadingHistory} className="gap-2">
                    {loadingHistory ? (
                      <>
                        <TbLoader2 className="w-4 h-4 animate-spin" />
                        加载中...
                      </>
                    ) : (
                      <>
                        <TbHistory className="w-4 h-4" />
                        加载更多历史视频
                      </>
                    )}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">已加载全部历史视频</p>
                )}
                {historyOffset > 0 && <p className="text-xs text-muted-foreground">已加载 {historyOffset} 条历史记录</p>}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* 设置对话框 */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>订阅设置</DialogTitle>
            <DialogDescription>配置此订阅的更新和下载选项</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>启用订阅</Label>
                <p className="text-xs text-muted-foreground">关闭后将不再自动检查更新</p>
              </div>
              <Switch checked={settingsForm.enabled} onCheckedChange={(checked) => setSettingsForm((prev) => ({ ...prev, enabled: checked }))} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>自动下载</Label>
                <p className="text-xs text-muted-foreground">自动下载新发布的内容</p>
              </div>
              <Switch checked={settingsForm.autoDownload} onCheckedChange={(checked) => setSettingsForm((prev) => ({ ...prev, autoDownload: checked }))} />
            </div>

            <div className="space-y-2">
              <Label>下载质量</Label>
              <Select value={settingsForm.downloadQuality} onValueChange={(value) => setSettingsForm((prev) => ({ ...prev, downloadQuality: value }))}>
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

            <div className="space-y-2">
              <Label>检查间隔（分钟）</Label>
              <Input type="number" min={5} max={1440} value={settingsForm.fetchInterval} onChange={(e) => setSettingsForm((prev) => ({ ...prev, fetchInterval: parseInt(e.target.value) || 60 }))} />
              <p className="text-xs text-muted-foreground">设置自动检查更新的时间间隔</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveSettings}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Feed 条目卡片组件
interface FeedItemCardProps {
  item: RssFeedItem;
  downloading: boolean;
  onDownload: () => void;
  formatTime: (ts?: number) => string;
  formatDuration: (ms?: number) => string;
  formatNumber: (num?: number) => string;
}

const FeedItemCard: React.FC<FeedItemCardProps> = ({ item, downloading, onDownload, formatTime, formatDuration, formatNumber }) => {
  const handleOpenExternal = useCallback(() => {
    if (item.link) {
      window.open(item.link, '_blank');
    }
  }, [item.link]);

  return (
    <div className="group flex gap-3 p-3 rounded-lg bg-card hover:bg-accent/50 transition-colors cursor-pointer" onClick={handleOpenExternal}>
      {/* 缩略图 */}
      <div className="relative w-40 h-24 rounded-md overflow-hidden bg-muted flex-shrink-0">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <TbPlayerPlay className="w-8 h-8 text-muted-foreground" />
          </div>
        )}

        {/* 时长 */}
        {item.durationMs && <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">{formatDuration(item.durationMs)}</div>}

        {/* 已下载标识 */}
        {item.downloaded && (
          <div className="absolute top-1 left-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <TbCheck className="w-3 h-3" />
            已下载
          </div>
        )}
      </div>

      {/* 内容信息 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="font-medium text-sm line-clamp-2 mb-1">{item.title}</h3>

        {item.author && <p className="text-xs text-muted-foreground mb-1">{item.author}</p>}

        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
          {/* 观看次数 */}
          {item.viewCount && (
            <span className="flex items-center gap-1">
              <TbEye className="w-3 h-3" />
              {formatNumber(item.viewCount)}
            </span>
          )}

          {/* 发布时间 */}
          <span className="flex items-center gap-1">
            <TbClock className="w-3 h-3" />
            {formatTime(item.publishedAt)}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!item.downloaded && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="w-8 h-8"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                disabled={downloading}
              >
                {downloading ? <TbLoader2 className="w-4 h-4 animate-spin" /> : <TbDownload className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>下载</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="w-8 h-8" onClick={handleOpenExternal}>
              <TbExternalLink className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>打开原始链接</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

export default RssFeedPage;
