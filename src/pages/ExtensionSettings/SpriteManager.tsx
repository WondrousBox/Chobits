import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import React, { useCallback, useEffect, useState } from 'react';
import { TbBug, TbPlayerPlay, TbTools, TbTrash, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SpriteAnimation, SpriteAnimationTrigger } from '@/features/sprite-assistant';
import { getPrimarySpriteAnimationTrigger, getSpriteAnimationTriggerAliases, getSpriteAnimationTriggers, SPRITE_EVENT_TYPES } from '@/features/sprite-assistant';
import { ensureSpriteCapabilityAccessible, SpriteCapabilityLockedNotice } from '@/features/sprite-assistant/capability-ui';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

import SpriteAnimationMetaPopover from './components/SpriteAnimationMetaPopover';
import SpriteTriggerPicker from './components/SpriteTriggerPicker';
import SpritePackManager from './SpritePackManager';
import SpriteVideoEditor, { type SpriteVideoConfig } from './SpriteVideoEditor';

function baseName(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  const last = parts[parts.length - 1] || '';
  return last;
}

function getPlaybackSize(outputSize: number, playbackScale?: number): number {
  return Math.max(1, Math.round(outputSize / Math.max(1, playbackScale || 1)));
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

export function SpriteAnimationManager({
  className,
  actionChoreographyCapability,
  onCapabilityBlocked
}: {
  className?: string;
  actionChoreographyCapability?: SpriteCapabilityState | null;
  onCapabilityBlocked?: (capability: SpriteCapabilityState) => void;
}): JSX.Element {
  const [list, setList] = useState<SpriteAnimation[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingMap, setAddingMap] = useState<Record<string, boolean>>({}); // 某分类中的添加状态
  const [categories, setCategories] = useState<string[]>([]); // 事件分类列表
  const [activeAddCat, setActiveAddCat] = useState<string | null>(null); // 当前触发的添加分类（用于弹窗后回填）
  const [query, setQuery] = useState(''); // 搜索框
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}); // 分类折叠状态
  const [globalCat, setGlobalCat] = useState<SpriteAnimationTrigger | ''>(''); // 全局导入选择的分类
  // 工具弹窗状态
  const [toolOpen, setToolOpen] = useState(false);
  // 精灵导入状态
  const [spriteConfig, setSpriteConfig] = useState<Partial<SpriteVideoConfig>>({});
  const [spriteProcessing, setSpriteProcessing] = useState(false);
  const [debugOverlay, setDebugOverlay] = useState(false);
  // 默认的内置分类：使用全部预设事件类型（不包含 custom）
  const BUILTIN = React.useMemo(() => SPRITE_EVENT_TYPES.filter((c) => c !== 'custom'), []);
  const canAuthorAnimations = actionChoreographyCapability?.status !== 'locked';
  const authoringLockedTitle = actionChoreographyCapability?.status === 'locked' ? `${actionChoreographyCapability.name} 尚未解锁` : undefined;

  const ensureCanAuthorAnimations = useCallback(
    (): boolean => ensureSpriteCapabilityAccessible(actionChoreographyCapability, onCapabilityBlocked),
    [actionChoreographyCapability, onCapabilityBlocked]
  );

  // 初始化读取调试辅助线状态
  useEffect(() => {
    window.YUA.sprite
      .getDebugOverlay()
      .then(setDebugOverlay)
      .catch(() => {});
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
      // 统计分类（meta.primaryTrigger / normalized trigger）
      const setCat = new Set<string>();
      for (const it of items || []) {
        const primaryTrigger = getPrimarySpriteAnimationTrigger(it.meta);
        if (primaryTrigger) setCat.add(primaryTrigger);
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

  const onImport = async (primaryTrigger?: SpriteAnimationTrigger): Promise<void> => {
    if (!ensureCanAuthorAnimations()) return;

    // 使用局部 catKey，避免并发导入时 activeAddCat 被后一次覆盖导致前一次 finally 复位错误
    const catKey = primaryTrigger ?? activeAddCat ?? '';
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
      await window.YUA.sprite.register({
        filePath: pick.path,
        meta: {
          id,
          title,
          primaryTrigger: catKey || undefined
        }
      });
      await refresh();
    } catch (e) {
      console.warn('sprite:register failed', e);
    } finally {
      setAddingMap((m) => ({ ...m, [catKey]: false }));
      setActiveAddCat(null);
    }
  };

  const onRemove = async (id: string): Promise<void> => {
    if (!ensureCanAuthorAnimations()) return;

    try {
      await window.YUA.sprite.remove(id, true);
      await refresh();
    } catch (e) {
      console.warn('sprite:remove failed', e);
    }
  };

  const [testingId, setTestingId] = useState<string | null>(null);

  const onUpdatePrimaryTrigger = useCallback(
    async (id: string, primaryTrigger: SpriteAnimationTrigger | ''): Promise<void> => {
      if (!ensureCanAuthorAnimations()) return;

      await window.YUA.sprite.updateMeta(id, {
        primaryTrigger: primaryTrigger || undefined
      });
      await refresh();
    },
    [ensureCanAuthorAnimations, refresh]
  );

  const onUpdateAnimationMeta = useCallback(
    async (id: string, meta: Pick<SpriteAnimation['meta'], 'condition' | 'primaryTrigger' | 'triggerAliases' | 'priority'>): Promise<void> => {
      if (!ensureCanAuthorAnimations()) return;

      await window.YUA.sprite.updateMeta(id, meta);
      await refresh();
    },
    [ensureCanAuthorAnimations, refresh]
  );

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
      return (
        it.meta.title.toLowerCase().includes(q) ||
        it.meta.id.toLowerCase().includes(q) ||
        getSpriteAnimationTriggers(it.meta).some((trigger) => trigger.toLowerCase().includes(q)) ||
        it.meta.tags?.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [list, query]);

  const grouped: Record<string, SpriteAnimation[]> = {};
  for (const it of filteredList) {
    const cat = getPrimarySpriteAnimationTrigger(it.meta) || 'uncategorized';
    (grouped[cat] ||= []).push(it);
  }
  // 基于原始 categories 顺序，只保留当前有条目的分类 (隐藏空分类)。如果搜索导致全部被过滤，fallback 显示“无结果”。
  const allCategories = categories.filter((c) => grouped[c]?.length); // 已有分类且非空
  if (grouped['uncategorized']?.length && !allCategories.includes('uncategorized')) allCategories.push('uncategorized');
  const hasAny = allCategories.length > 0;

  const toggleCollapse = (cat: string): void => setCollapsed((m) => ({ ...m, [cat]: !m[cat] }));

  return (
    <div className={className}>
      <SpriteCapabilityLockedNotice capability={actionChoreographyCapability} hint="动作编排尚未解锁时，可以查看和测试现有动画，但不能导入、删除或编辑动画 metadata。" className="mx-2 mb-4" />

      <div className="flex justify-between items-center px-2 mb-4">
        <div className="text-sm text-muted-foreground">已注册动画：{list.length}</div>
        <div className="flex gap-2 items-center">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索 (名称 / ID / 分类 / 标签)" className="h-8 w-48" />
          <SpriteTriggerPicker value={globalCat} onChange={setGlobalCat} buttonSize="sm" buttonClassName="w-[220px]" emptyLabel="未分类" />
          <Button size="sm" onClick={() => onImport(globalCat || undefined)} disabled={!canAuthorAnimations || !!addingMap[globalCat || '']} title={authoringLockedTitle}>
            {addingMap[globalCat || ''] ? '导入中…' : '导入视频'}
          </Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            刷新
          </Button>
          <Button size="sm" variant={debugOverlay ? 'default' : 'outline'} onClick={toggleDebugOverlay} title="调试辅助线">
            <TbBug />
          </Button>
          <Button size="sm" variant="outline" onClick={() => (ensureCanAuthorAnimations() ? setToolOpen(true) : undefined)} disabled={!canAuthorAnimations} title={authoringLockedTitle}>
            <TbTools />
            工具
          </Button>
        </div>
      </div>
      {/* 精灵导入工具弹窗 */}
      {toolOpen && (
        <div className="h-[100vh] w-[100vw] max-w-[unset] overflow-none fixed top-0 left-0 z-[40] bg-background">
          <div className="p-2 box-border flex justify-between items-center">
            精灵视频导入
            <Button size="icon" variant={'ghost'} onClick={() => setToolOpen(false)}>
              <TbX />
            </Button>
          </div>

          <div className="overflow-hidden h-full w-full p-2 box-border" style={{ height: 'calc(100% - 52px)' }}>
            <SpriteVideoEditor
              initialConfig={spriteConfig}
              onConfigChange={setSpriteConfig}
              isProcessing={spriteProcessing}
              actionChoreographyCapability={actionChoreographyCapability}
              onCapabilityBlocked={onCapabilityBlocked}
              onImportComplete={async () => {
                await refresh();
                setToolOpen(false);
              }}
              onProcess={async (config) => {
                // FFmpeg 路径（无色度键时）
                if (!config.inputPath) return;
                if (!ensureCanAuthorAnimations()) return;

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
                    meta: {
                      title: config.title,
                      primaryTrigger: config.primaryTrigger,
                      triggerAliases: config.triggerAliases,
                      priority: config.priority,
                      condition: config.condition
                    }
                  });
                  // 注册精灵（根据倍速调整 loop 时间）
                  const id = 'sprite-' + Math.random().toString(36).slice(2, 10);
                  const hasLoop = config.segments.loopEnd > config.segments.loopStart;
                  const sp = config.speeds;
                  const introDur = hasLoop ? (config.segments.loopStart - config.segments.start) / sp.intro : (config.segments.end - config.segments.start) / sp.intro;
                  const loopDur = hasLoop ? (config.segments.loopEnd - config.segments.loopStart) / sp.loop : 0;
                  const outroDur = hasLoop ? (config.segments.end - config.segments.loopEnd) / sp.outro : 0;
                  const spriteWidth = getPlaybackSize(config.output.width, config.playbackScale);
                  const spriteHeight = getPlaybackSize(config.output.height, config.playbackScale);
                  await window.YUA.sprite.register({
                    filePath: outputPath,
                    width: spriteWidth,
                    height: spriteHeight,
                    padding: config.padding,
                    loopStartMs: hasLoop ? introDur : undefined,
                    loopEndMs: hasLoop ? introDur + loopDur : undefined,
                    durationMs: introDur + loopDur + outroDur,
                    autoIdle: config.autoIdle,
                    movement: config.movement.enabled ? config.movement : undefined,
                    meta: {
                      id,
                      title: config.title || '自定义动画',
                      primaryTrigger: config.primaryTrigger || undefined,
                      triggerAliases: config.triggerAliases,
                      priority: config.priority,
                      condition: config.condition
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
        </div>
      )}

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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onImport(cat === 'uncategorized' ? undefined : (cat as SpriteAnimationTrigger))}
                    disabled={!canAuthorAnimations || addingMap[cat]}
                    title={authoringLockedTitle}
                  >
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
                      const primaryTrigger = getPrimarySpriteAnimationTrigger(item.meta);
                      const triggerAliases = getSpriteAnimationTriggerAliases(item.meta);
                      const priority = item.meta.priority;
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
                              <SpriteTriggerPicker
                                value={primaryTrigger || ''}
                                onChange={(nextValue) => {
                                  void onUpdatePrimaryTrigger(item.meta.id, nextValue);
                                }}
                                disabled={!canAuthorAnimations}
                                buttonSize="sm"
                                buttonClassName="h-8 min-w-[150px] bg-background/90"
                                emptyLabel="设置 trigger"
                                popoverClassName="w-[340px]"
                              />
                              <SpriteAnimationMetaPopover
                                meta={item.meta}
                                disabled={!canAuthorAnimations}
                                onSave={async (nextMeta) => {
                                  await onUpdateAnimationMeta(item.meta.id, nextMeta);
                                }}
                              />

                              {item.meta.deletable !== false && (
                                <Button size="icon" variant="destructive" className="w-8 h-8" onClick={() => onRemove(item.meta.id)} disabled={!canAuthorAnimations} title={authoringLockedTitle}>
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
                              {primaryTrigger && <div className="mt-1 text-[10px] inline-block px-1 py-[1px] rounded bg-primary/70 text-white w-fit">{primaryTrigger}</div>}
                              {triggerAliases.length > 0 && <div className="mt-1 text-[10px] opacity-80 truncate">aliases: {triggerAliases.join(', ')}</div>}
                              {priority !== undefined && <div className="mt-1 text-[10px] opacity-80 truncate">priority: {priority}</div>}
                              {item.meta.condition && <div className="mt-1 text-[10px] opacity-80 truncate">condition: persona-gated</div>}
                              {/* 结束覆盖层 */}
                            </div>
                            {/* 结束相对容器 */}
                          </div>
                        </div>
                      );
                    })}
                    {/* 分类尾部添加卡片 */}
                    <Button
                      className="h-[240px] w-[180px]"
                      onClick={() => onImport(cat === 'uncategorized' ? undefined : (cat as SpriteAnimationTrigger))}
                      disabled={!canAuthorAnimations || addingMap[cat]}
                      variant="ghost"
                      title={authoringLockedTitle}
                    >
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

export default function SpriteManager({
  className,
  actionChoreographyCapability,
  onCapabilityBlocked
}: {
  className?: string;
  actionChoreographyCapability?: SpriteCapabilityState | null;
  onCapabilityBlocked?: (capability: SpriteCapabilityState) => void;
}): JSX.Element {
  return (
    <div className={className}>
      <SpritePackManager
        editorPresentation="window"
        editorExtra={<SpriteAnimationManager className="border-t border-border/60 pt-4" actionChoreographyCapability={actionChoreographyCapability} onCapabilityBlocked={onCapabilityBlocked} />}
      />
    </div>
  );
}
