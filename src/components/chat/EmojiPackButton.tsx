import type { EmojiPacksDisplayTarget } from '@packages/ai/types';
import type * as PopoverPrimitive from '@radix-ui/react-popover';
import { Archive, FolderOpen, FolderPlus, ImagePlus, Loader2, PackageOpen, SmilePlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getLocalPathForFile } from '@/lib/local-file-path';
import { cn } from '@/lib/utils';

import type { EmojiPackImportResult, EmojiPackSummary } from '../../../electron/main/handlers/emoji-packs/types';

interface EmojiPackButtonProps {
  enabled: boolean;
  displayTarget: EmojiPacksDisplayTarget;
  onEnabledChange: (enabled: boolean) => void;
  onDisplayTargetChange: (target: EmojiPacksDisplayTarget) => void;
  onOpenChange?: (open: boolean) => void;
  contentSide?: PopoverPrimitive.PopoverContentProps['side'];
  contentAlign?: PopoverPrimitive.PopoverContentProps['align'];
  avoidCollisions?: PopoverPrimitive.PopoverContentProps['avoidCollisions'];
}

function extractDroppedPaths(files: File[]): string[] {
  return files.map(getLocalPathForFile).filter((filePath): filePath is string => Boolean(filePath));
}

function summarizeImportResults(results: EmojiPackImportResult[]): void {
  const successCount = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok);

  if (successCount > 0) {
    toast.success(`已导入 ${successCount} 个表情包`);
  }

  if (failed.length > 0) {
    toast.error('部分表情包导入失败', {
      description: failed
        .slice(0, 2)
        .map((item) => item.error || item.sourcePath)
        .join('\n')
    });
  }
}

function hasSuccessfulImport(results: EmojiPackImportResult[]): boolean {
  return results.some((item) => item.ok);
}

export default function EmojiPackButton({
  enabled,
  displayTarget,
  contentSide,
  contentAlign = 'start',
  avoidCollisions,
  onEnabledChange,
  onDisplayTargetChange,
  onOpenChange
}: EmojiPackButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState<EmojiPackSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const packCount = packs.length;
  const hasPacks = packCount > 0;

  const refreshPacks = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setPacks((await window.YUA.emojiPacks['emojiPacks:listPacks']()) || []);
    } catch {
      setPacks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPacks();
  }, [refreshPacks]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  const setEnabled = useCallback(
    (nextEnabled: boolean): void => {
      onEnabledChange(nextEnabled);
    },
    [onEnabledChange]
  );

  const importFromPaths = useCallback(
    async (paths: string[]): Promise<void> => {
      if (!paths.length) {
        toast.error('没有拿到可导入路径');
        return;
      }
      setImporting(true);
      try {
        const results = await window.YUA.emojiPacks['emojiPacks:importFromPaths']({ paths });
        summarizeImportResults(results);
        await refreshPacks();
        if (hasSuccessfulImport(results)) {
          onEnabledChange(true);
        }
      } finally {
        setImporting(false);
      }
    },
    [onEnabledChange, refreshPacks]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      void importFromPaths(extractDroppedPaths(acceptedFiles));
    },
    [importFromPaths]
  );

  const dropzone = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop
  });

  const pickFolder = async (): Promise<void> => {
    setImporting(true);
    try {
      const result = await window.YUA.emojiPacks['emojiPacks:pickFolderAndImport']();
      if (!result.canceled) {
        summarizeImportResults(result.results);
        await refreshPacks();
        if (hasSuccessfulImport(result.results)) {
          onEnabledChange(true);
        }
      }
    } finally {
      setImporting(false);
    }
  };

  const pickArchive = async (): Promise<void> => {
    setImporting(true);
    try {
      const result = await window.YUA.emojiPacks['emojiPacks:pickArchiveAndImport']();
      if (!result.canceled) {
        summarizeImportResults(result.results);
        await refreshPacks();
        if (hasSuccessfulImport(result.results)) {
          onEnabledChange(true);
        }
      }
    } finally {
      setImporting(false);
    }
  };

  const statusText = useMemo(() => {
    if (loading) return '扫描中';
    if (!hasPacks) return '未导入';
    return `${packCount} 个包`;
  }, [hasPacks, loading, packCount]);
  const showInBubble = displayTarget === 'sprite-bubble';

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
      }}
    >
      <div className="inline-flex h-8 shrink-0 overflow-hidden rounded-full border border-border/70 bg-background/70">
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('h-8 w-8 rounded-none border-0', enabled && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}
                aria-label="管理表情包"
              >
                {enabled ? <SmilePlus /> : <ImagePlus />}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{enabled ? (showInBubble ? '表情包会显示在角色气泡' : '表情包会显示在对话中') : '表情包回复已关闭'}</TooltipContent>
        </Tooltip>
      </div>
      <PopoverContent align={contentAlign} side={contentSide} avoidCollisions={avoidCollisions} className="no-drag pointer-events-auto w-80 p-0">
        <div className="px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <PackageOpen className="h-4 w-4" />
                <span>表情包</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{statusText}</span>
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={(checked) => void setEnabled(checked)} aria-label={enabled ? '关闭表情包回复' : '开启表情包回复'} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-medium">角色浮动气泡展示</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{showInBubble ? '开启后表情包推送到角色气泡' : '关闭后沿用对话内展示'}</div>
            </div>
            <Switch
              checked={showInBubble}
              onCheckedChange={(checked) => onDisplayTargetChange(checked ? 'sprite-bubble' : 'chat')}
              aria-label={showInBubble ? '关闭角色浮动气泡展示' : '开启角色浮动气泡展示'}
            />
          </div>

          <div
            {...dropzone.getRootProps()}
            className={cn(
              'mt-3 flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed px-3 py-4 text-center transition-colors',
              dropzone.isDragActive ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'
            )}
          >
            <input {...dropzone.getInputProps()} />
            {importing ? <Loader2 className="mb-2 h-5 w-5 animate-spin text-primary" /> : <Archive className="mb-2 h-5 w-5 text-muted-foreground" />}
            <div className="text-xs font-medium">{dropzone.isDragActive ? '松开导入' : '拖入压缩包或文件夹'}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">zip / 7z / rar / tar / 图片目录</div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={importing} onClick={() => void pickFolder()}>
              <FolderPlus />
              选择文件夹
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={importing} onClick={() => void pickArchive()}>
              <Archive />
              选择压缩包
            </Button>
          </div>
        </div>

        {hasPacks && (
          <>
            <Separator />
            <div className="max-h-48 overflow-y-auto py-1">
              {packs.map((pack) => (
                <div key={pack.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {pack.previewUrls[0] ? <img src={pack.previewUrls[0]} alt={pack.name} className="h-full w-full object-cover" /> : <PackageOpen className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{pack.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {pack.totalFileCount} 张 · {pack.topLevelFolders.slice(0, 4).join('、') || '根目录'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={() => {
                      void window.YUA.emojiPacks['emojiPacks:revealPack']({ packId: pack.id });
                    }}
                    aria-label="在文件管理器中显示"
                  >
                    <FolderOpen />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
