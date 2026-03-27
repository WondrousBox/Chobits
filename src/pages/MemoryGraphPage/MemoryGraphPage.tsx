import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { TbBrain, TbFocus2, TbLoader2, TbNote, TbRefresh, TbSearch, TbTopologyRing, TbX, TbZoomIn, TbZoomOut, TbZoomReset } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// ━━ Types ━━

interface TopicNode {
  id: string;
  label: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  noteCount?: number | null;
  heat?: number | null;
  centralityHint?: number | null;
  keywords?: string | null;
  aliases?: string | null;
  lastSeenAt?: number | null;
}

interface NoteNode {
  id: string;
  summary: string;
  topics: string;
  date: string;
  importance?: number | null;
  keywords?: string | null;
}

interface EdgeRow {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  weight?: number | null;
}

// Force graph data types
interface GraphNode {
  id: string;
  label: string;
  type: 'topic' | 'note';
  heat: number;
  noteCount: number;
  size: number;
  color: string;
  description?: string;
  keywords?: string[];
  date?: string;
  importance?: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface GraphLink {
  source: string;
  target: string;
  relationType: string;
  weight: number;
  color: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ━━ Color Helpers ━━

const TOPIC_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#0ea5e9'];

function heatToColor(heat: number): string {
  const idx = Math.min(Math.floor(heat * TOPIC_COLORS.length), TOPIC_COLORS.length - 1);
  return TOPIC_COLORS[idx];
}

function noteColor(importance: number): string {
  const alpha = 0.4 + importance * 0.6;
  return `rgba(59, 130, 246, ${alpha})`;
}

const RELATION_COLORS: Record<string, string> = {
  parent_topic_of: 'rgba(139, 92, 246, 0.5)',
  belongs_to_topic: 'rgba(59, 130, 246, 0.4)',
  related_to_topic: 'rgba(20, 184, 166, 0.5)',
  related_to_note: 'rgba(234, 179, 8, 0.3)',
  shares_keyword: 'rgba(168, 85, 247, 0.3)',
  references_note: 'rgba(249, 115, 22, 0.3)'
};

// ━━ Build Graph Helpers ━━

function buildGraphData(topics: TopicNode[], edges: EdgeRow[], notes: NoteNode[], showNotes: boolean, searchTerm: string): GraphData {
  const nodeMap = new Map<string, GraphNode>();

  for (const t of topics) {
    const heat = t.heat ?? 0;
    const noteCount = t.noteCount ?? 0;
    const size = Math.max(6, Math.min(30, 6 + noteCount * 2 + heat * 10));
    let keywords: string[] = [];
    try {
      keywords = t.keywords ? JSON.parse(t.keywords) : [];
    } catch {
      /* ignore */
    }

    nodeMap.set(t.id, { id: t.id, label: t.label, type: 'topic', heat, noteCount, size, color: heatToColor(heat), description: t.description ?? undefined, keywords });
  }

  if (showNotes) {
    for (const n of notes) {
      const importance = n.importance ?? 0.5;
      let keywords: string[] = [];
      try {
        keywords = n.keywords ? JSON.parse(n.keywords) : [];
      } catch {
        /* ignore */
      }

      nodeMap.set(n.id, {
        id: n.id,
        label: n.summary?.slice(0, 40) || n.id.slice(0, 12),
        type: 'note',
        heat: 0,
        noteCount: 0,
        size: 4 + importance * 4,
        color: noteColor(importance),
        description: n.summary,
        keywords,
        date: n.date,
        importance
      });
    }
  }

  let activeNodeIds: Set<string> | null = null;
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    activeNodeIds = new Set<string>();
    for (const [, node] of nodeMap) {
      if (node.label.toLowerCase().includes(lower) || node.description?.toLowerCase().includes(lower) || node.keywords?.some((k) => k.toLowerCase().includes(lower))) {
        activeNodeIds.add(node.id);
      }
    }
    for (const edge of edges) {
      if (activeNodeIds.has(edge.sourceId) && nodeMap.has(edge.targetId)) activeNodeIds.add(edge.targetId);
      if (activeNodeIds.has(edge.targetId) && nodeMap.has(edge.sourceId)) activeNodeIds.add(edge.sourceId);
    }
  }

  const filteredNodes = activeNodeIds ? Array.from(nodeMap.values()).filter((n) => activeNodeIds!.has(n.id)) : Array.from(nodeMap.values());
  const validIds = new Set(filteredNodes.map((n) => n.id));

  const links: GraphLink[] = [];
  const seenLinks = new Set<string>();
  for (const e of edges) {
    if (!validIds.has(e.sourceId) || !validIds.has(e.targetId)) continue;
    if (e.sourceId === e.targetId) continue;
    const key = `${e.sourceId}-${e.targetId}-${e.relationType}`;
    if (seenLinks.has(key)) continue;
    seenLinks.add(key);
    links.push({ source: e.sourceId, target: e.targetId, relationType: e.relationType, weight: e.weight ?? 1, color: RELATION_COLORS[e.relationType] || 'rgba(148, 163, 184, 0.3)' });
  }

  return { nodes: filteredNodes, links };
}

// ━━ Detail Panel ━━

function DetailPanel({ node, onClose, onFocusTopic }: { node: GraphNode | null; onClose: () => void; onFocusTopic?: (topicId: string) => void }): React.ReactElement | null {
  if (!node) return null;

  return (
    <div className="absolute right-0 top-9 bottom-0 w-80 bg-background/95 backdrop-blur-sm border-l border-border shadow-lg z-20 overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {node.type === 'topic' ? <TbTopologyRing className="h-4 w-4 text-violet-500" /> : <TbNote className="h-4 w-4 text-blue-500" />}
            <span className="text-xs font-medium text-muted-foreground uppercase">{node.type === 'topic' ? '主题' : '笔记'}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <TbX className="h-3.5 w-3.5" />
          </Button>
        </div>

        <h3 className="text-base font-semibold mb-2 break-words">{node.label}</h3>

        {node.description && <p className="text-sm text-muted-foreground mb-3 break-words">{node.description}</p>}

        <div className="space-y-2 text-xs">
          {node.type === 'topic' && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">活跃度</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${node.heat * 100}%`, background: 'linear-gradient(90deg, #60a5fa, #f97316)' }} />
                  </div>
                  <span className="tabular-nums">{(node.heat * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">关联笔记数</span>
                <span className="tabular-nums">{node.noteCount}</span>
              </div>
            </>
          )}
          {node.type === 'note' && node.date && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">日期</span>
              <span>{node.date}</span>
            </div>
          )}
          {node.type === 'note' && node.importance !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">重要度</span>
              <span className="tabular-nums">{(node.importance * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>

        {node.keywords && node.keywords.length > 0 && (
          <div className="mt-3">
            <span className="text-xs text-muted-foreground">关键词</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {node.keywords.map((kw, i) => (
                <span key={i} className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {node.type === 'topic' && onFocusTopic && (
          <Button variant="outline" size="sm" className="w-full mt-4" onClick={() => onFocusTopic(node.id)}>
            <TbFocus2 className="h-3.5 w-3.5 mr-1.5" />
            聚焦此主题
          </Button>
        )}
      </div>
    </div>
  );
}

// ━━ Main Component ━━

export default function MemoryGraphPage(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>();
  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [rawTopics, setRawTopics] = useState<TopicNode[]>([]);
  const [rawEdges, setRawEdges] = useState<EdgeRow[]>([]);
  const [rawNotes, setRawNotes] = useState<NoteNode[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [focusTopicId, setFocusTopicId] = useState<string | undefined>();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // ━━ Load data ━━

  const loadGraphData = useCallback(async (topicId?: string) => {
    setLoading(true);
    try {
      const result = await window.YUA.memory.graphData({ topicId, includeNotes: true, maxTopics: 200, maxEdges: 500 });
      setRawTopics(result.topics ?? []);
      setRawEdges(result.edges ?? []);
      setRawNotes(result.notes ?? []);
      setFocusTopicId(topicId);
    } catch (err) {
      console.error('[MemoryGraph] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // ━━ Rebuild graph when raw data or filters change ━━

  useEffect(() => {
    const data = buildGraphData(rawTopics, rawEdges, rawNotes, showNotes, searchTerm);
    setGraphData(data);
  }, [rawTopics, rawEdges, rawNotes, showNotes, searchTerm]);

  // ━━ Resize observer ━━

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ━━ Node rendering ━━

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const isHovered = hoveredNode?.id === n.id;
      const isSelected = selectedNode?.id === n.id;
      const isFaded = searchTerm && !graphData.nodes.find((gn) => gn.id === n.id);

      ctx.save();

      if (n.type === 'topic') {
        const baseSize = n.size;
        const drawSize = isHovered || isSelected ? baseSize * 1.2 : baseSize;

        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(x, y, drawSize + 4, 0, 2 * Math.PI);
          ctx.fillStyle = `${n.color}33`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, drawSize, 0, 2 * Math.PI);
        ctx.fillStyle = isFaded ? `${n.color}44` : n.color;
        ctx.fill();

        ctx.strokeStyle = isSelected ? '#fff' : `${n.color}88`;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        const fontSize = Math.max(10, Math.min(14, 10 + n.noteCount));
        const scaledFont = fontSize / globalScale;
        ctx.font = `600 ${scaledFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textWidth = ctx.measureText(n.label).width;
        const textY = y + drawSize + scaledFont * 0.8;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x - textWidth / 2 - 2 / globalScale, textY - scaledFont * 0.5, textWidth + 4 / globalScale, scaledFont * 1.1);

        ctx.fillStyle = isFaded ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)';
        ctx.fillText(n.label, x, textY);
      } else {
        const size = n.size;
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
        ctx.fillStyle = isFaded ? `${n.color}44` : n.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      ctx.restore();
    },
    [hoveredNode, selectedNode, searchTerm, graphData.nodes]
  );

  // ━━ Link rendering ━━

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
    const l = link as any;
    const source = l.source;
    const target = l.target;
    if (!source?.x || !target?.x) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = l.color || 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = Math.max(0.5, (l.weight || 1) * 0.8);
    ctx.stroke();
    ctx.restore();
  }, []);

  // ━━ Interaction handlers ━━

  const handleNodeClick = useCallback((node: any) => {
    const n = node as GraphNode;
    setSelectedNode((prev) => (prev?.id === n.id ? null : n));
  }, []);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node as GraphNode | null);
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // ━━ Toolbar actions ━━

  const handleZoomIn = useCallback(() => {
    fgRef.current?.zoom(fgRef.current.zoom() * 1.5, 300);
  }, []);

  const handleZoomOut = useCallback(() => {
    fgRef.current?.zoom(fgRef.current.zoom() / 1.5, 300);
  }, []);

  const handleZoomReset = useCallback(() => {
    fgRef.current?.zoomToFit(400, 60);
  }, []);

  const handleRefresh = useCallback(() => {
    setSelectedNode(null);
    setSearchTerm('');
    loadGraphData(focusTopicId);
  }, [loadGraphData, focusTopicId]);

  const handleFocusTopic = useCallback(
    (topicId: string) => {
      loadGraphData(topicId);
    },
    [loadGraphData]
  );

  const handleClearFocus = useCallback(() => {
    loadGraphData();
  }, [loadGraphData]);

  // ━━ Stats ━━

  const stats = useMemo(() => ({ topics: rawTopics.length, notes: rawNotes.length, edges: rawEdges.length }), [rawTopics, rawNotes, rawEdges]);

  // ━━ Zoom to fit after data loads ━━

  useEffect(() => {
    if (!loading && graphData.nodes.length > 0) {
      const timer = setTimeout(() => {
        fgRef.current?.zoomToFit(400, 60);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, graphData.nodes.length]);

  return (
    <div className="h-full w-full flex flex-col bg-background overflow-hidden">
      <DragAbleTitle
        title={
          <div className="flex items-center gap-2 text-sm font-medium">
            <TbBrain className="h-4 w-4 text-violet-500" />
            <span>记忆图谱</span>
            {focusTopicId && (
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs text-muted-foreground no-drag" onClick={handleClearFocus}>
                ← 返回全局
              </Button>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-1">
            <div className="relative">
              <TbSearch className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索主题..." className="h-7 w-40 pl-7 text-xs" />
              {searchTerm && (
                <button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearchTerm('')}>
                  <TbX className="h-3 w-3" />
                </button>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 px-2">
                  <TbNote className="h-3.5 w-3.5 text-muted-foreground" />
                  <Switch checked={showNotes} onCheckedChange={setShowNotes} className="scale-75" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">显示笔记节点</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
                  <TbZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">放大</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
                  <TbZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">缩小</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomReset}>
                  <TbZoomReset className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">适配画布</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh}>
                  <TbRefresh className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">刷新</TooltipContent>
            </Tooltip>
          </div>
        }
      />

      <div className="flex-1 relative" ref={containerRef}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <TbLoader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">加载记忆图谱...</span>
            </div>
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <TbBrain className="h-12 w-12 opacity-30" />
              <div className="text-center">
                <p className="text-sm font-medium">暂无记忆数据</p>
                <p className="text-xs mt-1">开始对话后，记忆系统将自动提取并构建知识图谱</p>
              </div>
            </div>
          </div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeCanvasObject={paintNode}
            linkCanvasObject={paintLink}
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              const n = node as GraphNode;
              ctx.beginPath();
              ctx.arc(n.x ?? 0, n.y ?? 0, n.size + 4, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onBackgroundClick={handleBackgroundClick}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={0.85}
            d3AlphaDecay={0.03}
            d3VelocityDecay={0.3}
            warmupTicks={50}
            cooldownTicks={200}
            enableNodeDrag
            backgroundColor="transparent"
          />
        )}

        <div className="absolute left-3 bottom-3 flex items-center gap-3 text-[10px] text-muted-foreground bg-background/80 backdrop-blur-sm rounded-md px-2.5 py-1 border border-border/50">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} />
            主题 {stats.topics}
          </span>
          {showNotes && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm rotate-45" style={{ background: '#3b82f6' }} />
              笔记 {stats.notes}
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-px" style={{ background: '#94a3b8' }} />
            关系 {stats.edges}
          </span>
        </div>

        <div className="absolute left-3 top-3 text-[10px] text-muted-foreground bg-background/80 backdrop-blur-sm rounded-md px-2.5 py-2 border border-border/50 space-y-1">
          <div className="font-medium text-foreground/70 mb-1">图例</div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#6366f1' }} />
            <span>低活跃主题</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#f97316' }} />
            <span>高活跃主题</span>
          </div>
          {showNotes && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-sm rotate-45" style={{ background: '#3b82f6' }} />
              <span>记忆笔记</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground/60">
            <span>节点大小 = 关联数量</span>
          </div>
        </div>

        <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} onFocusTopic={handleFocusTopic} />
      </div>
    </div>
  );
}
