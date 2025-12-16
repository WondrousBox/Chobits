import React, { useCallback, useMemo, useRef, useState } from 'react';
import { TbAlertCircle, TbLoader2, TbMoodEmpty, TbPlayerPlay, TbSearch } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

import { ResourceItem } from './types';

interface ResourceRunPopoverProps {
  disabled?: boolean;
  running?: boolean;
  onSelect: (resource: ResourceItem) => Promise<void> | void;
}

const ResourceRunPopover: React.FC<ResourceRunPopoverProps> = ({ disabled, running, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return resources;
    return resources.filter((res) => {
      const possible = [res.title, res.filePath, res.url, res.id].filter(Boolean) as string[];
      return possible.some((field) => field.toLowerCase().includes(keyword));
    });
  }, [resources, query]);

  const fetchResources = useCallback(async (force = false): Promise<void> => {
    if (loadedRef.current && !force) return;
    const resourceApi = window.YUA?.resource;
    if (!resourceApi || typeof resourceApi['resource:list'] !== 'function') {
      setError('无法访问资源列表接口');
      setResources([]);
      loadedRef.current = false;
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await resourceApi['resource:list']();
      if (Array.isArray(list)) {
        setResources(list);
      } else {
        setResources([]);
      }
      loadedRef.current = true;
    } catch (err: any) {
      console.warn('[ResourceRunPopover] 加载资源失败', err);
      setError(err?.message || String(err));
      loadedRef.current = false;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      if (nextOpen) {
        setQuery('');
        loadedRef.current = false;
        void fetchResources();
      } else {
        setQuery('');
        setSelectingId(null);
      }
      setOpen(nextOpen);
    },
    [fetchResources]
  );

  const handleSelect = useCallback(
    async (resource: ResourceItem): Promise<void> => {
      if (!onSelect || selectingId === resource.id) return;
      setSelectingId(resource.id);
      try {
        await onSelect(resource);
        setOpen(false);
      } finally {
        setSelectingId(null);
      }
    },
    [onSelect, selectingId]
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" disabled={disabled || running || selectingId !== null}>
          <TbPlayerPlay />
          试运行
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-96 p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <TbSearch className="h-4 w-4 text-muted-foreground" />
          <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资源..." className="h-8" />
        </div>
        <ScrollArea className="max-h-72 h-72">
          <div className="py-1 w-96">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <TbLoader2 className="h-4 w-4 animate-spin" />
                资源加载中...
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground">
                <TbAlertCircle className="h-5 w-5 text-destructive" />
                <span>资源加载失败</span>
                <Button size="sm" variant="secondary" onClick={() => fetchResources(true)}>
                  重试
                </Button>
              </div>
            ) : filtered.length > 0 ? (
              filtered.map((item) => {
                const title = (item.title && item.title.trim()) || item.filePath || item.url || item.id;
                const subtitleParts: string[] = [];
                if (item.type) subtitleParts.push(item.type);
                if (item.filePath && item.filePath !== title) {
                  subtitleParts.push(item.filePath);
                } else if (item.url && item.url !== title) {
                  subtitleParts.push(item.url);
                }
                const subtitle = subtitleParts.join(' · ');
                const pending = selectingId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void handleSelect(item)}
                    className="w-full px-3 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none disabled:opacity-60"
                    disabled={pending}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-medium leading-tight truncate">{title}</span>
                        {subtitle ? <span className="text-xs text-muted-foreground truncate">{subtitle}</span> : null}
                      </div>
                      {pending ? <TbLoader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" /> : null}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                <TbMoodEmpty className="h-5 w-5" />
                暂无可用资源
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">选择资源后将立即运行当前流程</div>
      </PopoverContent>
    </Popover>
  );
};

export default ResourceRunPopover;
