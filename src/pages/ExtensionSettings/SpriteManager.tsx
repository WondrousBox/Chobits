import React, { useCallback, useEffect, useState } from 'react';
import { TbBug, TbPlayerPlay, TbTools, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { SpriteAnimation, SpriteEventType } from '@/features/sprite-assistant';
import { SPRITE_EVENT_TYPES, SpriteEventGroups } from '@/features/sprite-assistant';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

import SpriteVideoEditor, { type SpriteVideoConfig } from './SpriteVideoEditor';

function baseName(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  const last = parts[parts.length - 1] || '';
  return last;
}

// 小型预览组件：只有在 hover 时才真正挂载 <video>，离开时卸载，避免同时占用大量资源
// 精灵预览：静止首帧，hover 播放循环
function SpritePreview({ src, type, width, height }: { src: string; type: string; width: number; height: number }): JSX.Element {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // 初始：停在首帧
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {
      /* noop */
    }
  }, [src]);

  const handleEnter = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.loop = true;
      v.play().catch(() => {
        /* noop */
      });
    }
  }, []);

  const handleLeave = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* noop */
      }
    }
  }, []);

  return (
    <div
      className="group relative inline-block rounded-md overflow-hidden select-none transition cursor-pointer"
      style={{ width, height }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      aria-label="鼠标悬停预览"
    >
      <video
        ref={videoRef}
        width={width}
        height={height}
        muted
        playsInline
        // 不自动播放，只有 hover / always 时才 play()
        preload="metadata"
        className="h-full w-full object-cover bg-muted pointer-events-none"
      >
        <source src={src} type={type} />
      </video>
    </div>
  );
}

export default function SpriteManager({ className }: { className?: string }): JSX.Element {
  const [list, setList] = useState<SpriteAnimation[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingMap, setAddingMap] = useState<Record<string, boolean>>({}); // 某分类中的添加状态
  const [categories, setCategories] = useState<string[]>([]); // 事件分类列表
  const [activeAddCat, setActiveAddCat] = useState<string | null>(null); // 当前触发的添加分类（用于弹窗后回填）
  const [query, setQuery] = useState(''); // 搜索框
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}); // 分类折叠状态
  const [globalCat, setGlobalCat] = useState<string>(''); // 全局导入选择的分类
  // 工具弹窗状态
  const [toolOpen, setToolOpen] = useState(false);
  // 精灵导入状态
  const [spriteConfig, setSpriteConfig] = useState<Partial<SpriteVideoConfig>>({});
  const [spriteProcessing, setSpriteProcessing] = useState(false);
  const [debugOverlay, setDebugOverlay] = useState(false);
  // 默认的内置分类：使用全部预设事件类型（不包含 custom）
  const BUILTIN = React.useMemo(() => SPRITE_EVENT_TYPES.filter((c) => c !== 'custom'), []);

  // 初始化读取调试辅助线状态
  useEffect(() => {
    window.YUA.sprite.getDebugOverlay().then(setDebugOverlay).catch(() => { });
  }, []);

  const toggleDebugOverlay = useCallback(async () => {
    const next = !debugOverlay;
    setDebugOverlay(next);
    await window.YUA.sprite.setDebugOverlay(next);
  }, [debugOverlay]);

  const refresh = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const items = await window.YUA.sprite.list();
      setList(items || []);
      // 统计分类（meta.eventType）
      const setCat = new Set<string>();
      for (const it of items || []) {
        if (it.meta?.eventType) setCat.add(it.meta.eventType);
      }
      // 合并内置分类，保持稳定顺序
      const merged = [...BUILTIN, ...Array.from(setCat).filter((c) => !BUILTIN.includes(c))];
      setCategories(merged);
    } catch (e) {
      console.warn('sprite:list failed', e);
    } finally {
      setLoading(false);
    }
  }, [BUILTIN]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onImport = async (eventType?: string): Promise<void> => {
    // 使用局部 catKey，避免并发导入时 activeAddCat 被后一次覆盖导致前一次 finally 复位错误
    const catKey = eventType ?? activeAddCat ?? '';
    setActiveAddCat(catKey || null);
    setAddingMap((m) => ({ ...m, [catKey]: true }));
    try {
      const pick = await window.YUA.file['file:pickFile']({
        filters: [
          { name: 'Videos', extensions: ['webm', 'mp4', 'mov', 'mkv', 'ogg', 'ogv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        multi: false
      });
      if (pick.canceled || !pick.path) return;
      const title = baseName(pick.path);
      const id = 'sprite-' + Math.random().toString(36).slice(2, 10);
      await window.YUA.sprite.register({ filePath: pick.path, meta: { id, title, eventType: catKey || undefined } });
      await refresh();
    } catch (e) {
      console.warn('sprite:register failed', e);
    } finally {
      setAddingMap((m) => ({ ...m, [catKey]: false }));
      setActiveAddCat(null);
    }
  };

  const onRemove = async (id: string): Promise<void> => {
    try {
      await window.YUA.sprite.remove(id, true);
      await refresh();
    } catch (e) {
      console.warn('sprite:remove failed', e);
    }
  };

  const [testingId, setTestingId] = useState<string | null>(null);

  const onTestPlay = async (item: SpriteAnimation): Promise<void> => {
    setTestingId(item.meta.id);
    try {
      await window.YUA.sprite.testAnimation(item.meta.id);
    } catch (e) {
      console.warn('sprite:triggerById failed', e);
    } finally {
      setTimeout(() => setTestingId(null), 1500);
    }
  };

  // 按分类分组
  const filteredList = React.useMemo(() => {
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((it) => {
      return it.meta.title.toLowerCase().includes(q) || it.meta.id.toLowerCase().includes(q) || it.meta.eventType?.toLowerCase().includes(q) || it.meta.tags?.some((t) => t.toLowerCase().includes(q));
    });
  }, [list, query]);

  const grouped: Record<string, SpriteAnimation[]> = {};
  for (const it of filteredList) {
    const cat = it.meta?.eventType || 'uncategorized';
    (grouped[cat] ||= []).push(it);
  }
  // 基于原始 categories 顺序，只保留当前有条目的分类 (隐藏空分类)。如果搜索导致全部被过滤，fallback 显示“无结果”。
  const allCategories = categories.filter((c) => grouped[c]?.length); // 已有分类且非空
  if (grouped['uncategorized']?.length && !allCategories.includes('uncategorized')) allCategories.push('uncategorized');
  const hasAny = allCategories.length > 0;

  const toggleCollapse = (cat: string): void => setCollapsed((m) => ({ ...m, [cat]: !m[cat] }));

  return (
    <div className={className}>
      <div className="flex justify-between items-center px-2 mb-4">
        <div className="text-sm text-muted-foreground">已注册动画：{list.length}</div>
        <div className="flex gap-2 items-center">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索 (名称 / ID / 分类 / 标签)" className="h-8 w-48" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-40 justify-between">
                {globalCat || '未分类'}
                <span className="opacity-60 text-xs">▼</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[460px]">
              <DropdownMenuItem onClick={() => setGlobalCat('')}>未分类</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>动画事件</DropdownMenuLabel>
              {Object.entries(SpriteEventGroups).map(([group, items]) => (
                <DropdownMenuSub key={group}>
                  <DropdownMenuSubTrigger>{group}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {items.map((ev) => (
                      <DropdownMenuItem key={ev} onClick={() => setGlobalCat(ev)}>
                        {ev}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setGlobalCat('')}>清除选择</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => onImport(globalCat || undefined)} disabled={!!addingMap[globalCat || '']}>
            {addingMap[globalCat || ''] ? '导入中…' : '导入视频'}
          </Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            刷新
          </Button>
          <Button size="sm" variant={debugOverlay ? 'default' : 'outline'} onClick={toggleDebugOverlay} title="调试辅助线">
            <TbBug />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setToolOpen(true)}>
            <TbTools />
            工具
          </Button>
        </div>
      </div>
      {/* 精灵导入工具弹窗 */}
      <Dialog open={toolOpen} onOpenChange={setToolOpen}>
        <DialogContent className="max-w-4xl h-[80vh] max-h-[90vh] overflow-none">
          <DialogHeader>
            <DialogTitle>精灵视频导入</DialogTitle>
          </DialogHeader>
          <div className="overflow-hidden h-full w-full">
            <SpriteVideoEditor
              initialConfig={spriteConfig}
              onConfigChange={setSpriteConfig}
              isProcessing={spriteProcessing}
              onImportComplete={async () => {
                await refresh();
                setToolOpen(false);
              }}
              onProcess={async (config) => {
                // FFmpeg 路径（无色度键时）
                if (!config.inputPath) return;
                const outputPath = config.inputPath.replace(/\.[^.\\/]+$/i, '') + '.sprite.webm';
                setSpriteProcessing(true);
                try {
                  await window.YUA.ffmpeg.convertToSpriteAnimation({
                    inputPath: config.inputPath,
                    outputPath,
                    segments: config.segments,
                    speeds: config.speeds,
                    output: config.output,
                    chromaKey: { enabled: false, color: '#00ff00', similarity: 0, blend: 0 },
                    meta: { eventType: config.eventType, title: config.title }
                  });
                  // 注册精灵（根据倍速调整 loop 时间）
                  const id = 'sprite-' + Math.random().toString(36).slice(2, 10);
                  const hasLoop = config.segments.loopEnd > config.segments.loopStart;
                  const sp = config.speeds;
                  const introDur = hasLoop ? (config.segments.loopStart - config.segments.start) / sp.intro : (config.segments.end - config.segments.start) / sp.intro;
                  const loopDur = hasLoop ? (config.segments.loopEnd - config.segments.loopStart) / sp.loop : 0;
                  const outroDur = hasLoop ? (config.segments.end - config.segments.loopEnd) / sp.outro : 0;
                  await window.YUA.sprite.register({
                    filePath: outputPath,
                    loopStartMs: hasLoop ? introDur : undefined,
                    loopEndMs: hasLoop ? introDur + loopDur : undefined,
                    durationMs: introDur + loopDur + outroDur,
                    meta: {
                      id,
                      title: config.title || '自定义动画',
                      eventType: config.eventType || undefined
                    }
                  });
                  await refresh();
                  setToolOpen(false);
                } catch (e: any) {
                  console.error('精灵导入失败:', e);
                } finally {
                  setSpriteProcessing(false);
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 防止窗口增高时 Grid 行被平均拉伸：content-start(items-start) 让多余空间留在容器底部 */}
      <div className="pr-1">
        {hasAny ? (
          allCategories.map((cat) => (
            <div key={cat} className="mb-4 last:mb-0 border border-border/40 rounded-md">
              <div className="flex items-center justify-between px-2 py-1 bg-muted/40 rounded-t-md">
                <div className="flex items-center gap-2">
                  <Button size={'icon'} className="w-8 h-8" onClick={() => toggleCollapse(cat)} aria-label={collapsed[cat] ? '展开分类' : '折叠分类'} variant={'outline'}>
                    {collapsed[cat] ? '+' : '-'}
                  </Button>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat === 'uncategorized' ? '未分类' : cat}</div>
                  <div className="text-[10px] text-muted-foreground/70">({grouped[cat]?.length || 0})</div>
                </div>
                <div className="flex items-center gap-2">
                  {cat !== 'uncategorized' && (
                    <Button size="sm" variant="ghost" onClick={() => window.YUA.sprite.trigger(cat)} title={`触发 ${cat} 事件：播放动画 + 显示气泡`}>
                      <TbPlayerPlay className="h-3 w-3 mr-1" />
                      测试
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => onImport(cat)} disabled={addingMap[cat]}>
                    {addingMap[cat] ? '导入中…' : '添加'}
                  </Button>
                </div>
              </div>
              {!collapsed[cat] && (
                <div className="p-2">
                  <div className="grid gap-4 content-start items-start justify-items-center" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                    {grouped[cat]?.map((item) => {
                      const src = item.source?.localPath ? makeResSrc(item.source.localPath) : item.source?.src || '';
                      const type = item.source?.type || 'video/webm';
                      const PW = 180,
                        PH = 240; // 基础预览尺寸（列最小宽 200 时刚好贴合）
                      return (
                        <div key={item.meta.id} className="group bg-card border border-border rounded-lg flex flex-col gap-2 w-full max-w-[240px] shadow-sm hover:shadow-md transition-shadow">
                          <div className="relative rounded-md overflow-hidden flex justify-center">
                            {src ? <SpritePreview src={src} type={type} width={PW} height={PH} /> : <div style={{ width: PW, height: PH }} className="rounded-md bg-muted" />}
                            {/* 顶部操作按钮（hover 显示） */}
                            <div className="absolute top-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              {/* 测试播放按钮 */}
                              <Button
                                size="icon"
                                variant="secondary"
                                className="w-8 h-8"
                                onClick={() => onTestPlay(item)}
                                disabled={testingId === item.meta.id}
                                title="测试播放：在桌面精灵上预览此动画"
                              >
                                <TbPlayerPlay className="h-4 w-4" />
                              </Button>
                              {!item.meta.eventType && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline">
                                      分类
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent side="top" align="start">
                                    <DropdownMenuLabel>动画事件</DropdownMenuLabel>
                                    {Object.entries(SpriteEventGroups).map(([group, items]) => (
                                      <DropdownMenuSub key={group}>
                                        <DropdownMenuSubTrigger>{group}</DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                          {items.map((ev) => (
                                            <DropdownMenuItem
                                              key={ev}
                                              onClick={async () => {
                                                await window.YUA.sprite.updateMeta(item.meta.id, { eventType: ev as SpriteEventType });
                                                await refresh();
                                              }}
                                            >
                                              {ev}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}

                              {item.meta.deletable !== false && (
                                <Button size="icon" variant="destructive" className="w-8 h-8" onClick={() => onRemove(item.meta.id)}>
                                  <TbTrash className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            {/* 信息覆盖层：默认显示，hover 隐藏 */}
                            <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent text-white opacity-100 group-hover:opacity-0 transition-opacity duration-200">
                              <div className="text-sm font-semibold truncate"> {item.meta.title || item.meta.id} </div>
                              <div className="text-[10px] opacity-80 truncate">ID: {item.meta.id}</div>
                              <div className="text-[10px] opacity-80 truncate">
                                {item.width}x{item.height} · {item.source?.type}
                              </div>
                              {item.meta.eventType && <div className="mt-1 text-[10px] inline-block px-1 py-[1px] rounded bg-primary/70 text-white w-fit">{item.meta.eventType}</div>}
                              {/* 结束覆盖层 */}
                            </div>
                            {/* 结束相对容器 */}
                          </div>
                        </div>
                      );
                    })}
                    {/* 分类尾部添加卡片 */}
                    <Button className="h-[240px] w-[180px]" onClick={() => onImport(cat)} disabled={addingMap[cat]} variant="ghost">
                      + 添加
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center text-xs text-muted-foreground py-8">无匹配结果</div>
        )}
      </div>
    </div>
  );
}
