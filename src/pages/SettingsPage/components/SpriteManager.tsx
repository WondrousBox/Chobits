import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { makeResSrc } from '@/lib/resourceProtocol';
import { TbTrash } from 'react-icons/tb';
import type { SpriteAnimation, SpriteEventType } from '@/components/AIAssistant/types';
import { ALL_SPRITE_EVENT_TYPES, SpriteEventGroups, AdditionalSpriteEventGroups } from '@/components/AIAssistant/types';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

function baseName(p: string) {
  const parts = p.replace(/\\/g, '/').split('/');
  const last = parts[parts.length - 1] || '';
  return last;
}

// 小型预览组件：只有在 hover 时才真正挂载 <video>，离开时卸载，避免同时占用大量资源
// 精灵预览：静止首帧，hover 播放循环
function SpritePreview({ src, type, width, height }: { src: string; type: string; width: number; height: number }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // 初始：停在首帧
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch { }
  }, [src]);

  const handleEnter = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.loop = true;
      v.play().catch(() => { });
    }
  }, []);

  const handleLeave = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch { }
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

export default function SpriteManager() {
  const [list, setList] = useState<SpriteAnimation[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingMap, setAddingMap] = useState<Record<string, boolean>>({}); // 某分类中的添加状态
  const [categories, setCategories] = useState<string[]>([]); // 事件分类列表
  const [activeAddCat, setActiveAddCat] = useState<string | null>(null); // 当前触发的添加分类（用于弹窗后回填）
  const [query, setQuery] = useState(''); // 搜索框
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}); // 分类折叠状态
  const [globalCat, setGlobalCat] = useState<string>(''); // 全局导入选择的分类
  // 默认的内置分类：使用全部预设事件类型（不包含 custom）
  const BUILTIN = React.useMemo(() => ALL_SPRITE_EVENT_TYPES.filter((c) => c !== 'custom'), []);

  const refresh = async () => {
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
  };

  useEffect(() => {
    refresh();
  }, []);

  const onImport = async (eventType?: string) => {
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

  const onRemove = async (id: string) => {
    try {
      await window.YUA.sprite.remove(id, true);
      await refresh();
    } catch (e) {
      console.warn('sprite:remove failed', e);
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

  const toggleCollapse = (cat: string) => setCollapsed((m) => ({ ...m, [cat]: !m[cat] }));

  return (
    <div className="h-full">
      <div className="flex justify-between items-center px-2">
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
              <DropdownMenuLabel>消息语义</DropdownMenuLabel>
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
              <DropdownMenuLabel>扩展动画</DropdownMenuLabel>
              {Object.entries(AdditionalSpriteEventGroups).map(([group, items]) => (
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
        </div>
      </div>

      {/* 防止窗口增高时 Grid 行被平均拉伸：content-start(items-start) 让多余空间留在容器底部 */}
      <div className="overflow-y-auto pr-1" style={{ height: 'calc(100% - 32px)' }}>
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
                      const PW = 200,
                        PH = 240; // 基础预览尺寸（列最小宽 200 时刚好贴合）
                      return (
                        <div key={item.meta.id} className="group bg-card border border-border rounded-lg flex flex-col gap-2 w-full max-w-[220px] shadow-sm hover:shadow-md transition-shadow">
                          <div className="relative rounded-md overflow-hidden flex justify-center">
                            {src ? <SpritePreview src={src} type={type} width={PW} height={PH} /> : <div style={{ width: PW, height: PH }} className="rounded-md bg-muted" />}
                            {/* 顶部右上角删除按钮（hover 显示） */}
                            <div className="absolute top-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              {!item.meta.eventType && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline">
                                      分类
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent side="top" align="start">
                                    <DropdownMenuLabel>消息语义</DropdownMenuLabel>
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
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>扩展动画</DropdownMenuLabel>
                                    {Object.entries(AdditionalSpriteEventGroups).map(([group, items]) => (
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

                              {item.meta.deletable !== false ? (
                                <Button size="icon" variant="destructive" className="w-8 h-8" title="删除" onClick={() => onRemove(item.meta.id)}>
                                  <TbTrash className="h-4 w-4" />
                                </Button>
                              ) : null}
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
                    <div className="border border-dashed border-border/60 rounded-lg flex items-center justify-center p-4 min-h-[120px] w-full max-w-[220px]">
                      <Button size="sm" onClick={() => onImport(cat)} disabled={addingMap[cat]} variant="ghost">
                        + 添加{cat === 'uncategorized' ? '' : `（${cat}）`}
                      </Button>
                    </div>
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
