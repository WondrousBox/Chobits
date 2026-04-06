import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import {
  TbArrowRight,
  TbBrain,
  TbCalendar,
  TbChevronRight,
  TbFileText,
  TbFocus2,
  TbLayoutSidebar,
  TbList,
  TbLoader2,
  TbNote,
  TbRefresh,
  TbSearch,
  TbStar,
  TbTag,
  TbTopologyRing,
  TbX,
  TbZoomIn,
  TbZoomOut,
  TbZoomReset
} from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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

interface KeywordNode {
  id: string;
  canonical: string;
  aliases?: string | null;
  entityType?: string | null;
  primaryTopicId?: string | null;
  occurrenceCount?: number | null;
}

interface NoteKeywordLink {
  noteId: string;
  keywordId: string;
  relevance?: number | null;
}

// Search result types
interface SearchResultNote {
  id: string;
  date: string;
  topics: string[];
  summary: string;
  importance: number;
  sections?: Array<{ heading: string; summary: string }>;
}

interface SearchResult {
  topics: Array<{ label: string; heat: number }>;
  notes: SearchResultNote[];
  totalFound: number;
}

// Note detail types
interface NoteOutline {
  heading: string;
  level: number;
  summary: string;
  charCount: number;
}

interface NoteDetail {
  noteId: string;
  date: string;
  topics: string[];
  content?: string;
  heading?: string;
  lineRange?: { start: number; end: number };
  outline?: NoteOutline[];
}

// Topic detail types
interface TopicDetail {
  topic?: { id: string; label: string; description?: string; heat: number; noteCount: number };
  children?: Array<{ id: string; label: string; heat: number; noteCount: number }>;
  related?: Array<{ id: string; label: string; heat: number; relationType: string }>;
  notes?: Array<{ id: string; date: string; summary: string; importance: number }>;
}

// Force graph data types
interface GraphNode {
  id: string;
  label: string;
  type: 'topic' | 'note' | 'keyword';
  heat: number;
  noteCount: number;
  size: number;
  color: string;
  description?: string;
  keywords?: string[];
  date?: string;
  importance?: number;
  entityType?: string;
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

type SidebarTab = 'search' | 'notes';

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

const ENTITY_TYPE_COLORS: Record<string, string> = {
  person: '#f59e0b',
  product: '#10b981',
  technology: '#06b6d4',
  organization: '#8b5cf6',
  concept: '#ec4899',
  location: '#ef4444',
  event: '#f97316',
  keyword: '#22c55e',
  other: '#94a3b8'
};

function keywordColor(entityType?: string | null): string {
  return ENTITY_TYPE_COLORS[entityType ?? 'keyword'] ?? ENTITY_TYPE_COLORS.keyword;
}

const RELATION_COLORS: Record<string, string> = {
  parent_topic_of: 'rgba(139, 92, 246, 0.5)',
  belongs_to_topic: 'rgba(59, 130, 246, 0.4)',
  related_to_topic: 'rgba(20, 184, 166, 0.5)',
  related_to_note: 'rgba(234, 179, 8, 0.3)',
  shares_keyword: 'rgba(168, 85, 247, 0.3)',
  references_note: 'rgba(249, 115, 22, 0.3)',
  note_has_keyword: 'rgba(34, 197, 94, 0.35)',
  keyword_to_topic: 'rgba(139, 92, 246, 0.3)'
};

function safeJsonParse(json: string | null | undefined, fallback: any[] = []): any[] {
  if (!json) return fallback;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

// ━━ Build Graph Helpers ━━

function buildGraphData(
  topics: TopicNode[],
  edges: EdgeRow[],
  notes: NoteNode[],
  showNotes: boolean,
  filterTerm: string,
  keywordNodes: KeywordNode[] = [],
  noteKeywordLinks: NoteKeywordLink[] = [],
  showKeywords = false
): GraphData {
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

  // 添加关键词节点
  if (showKeywords) {
    for (const kw of keywordNodes) {
      const count = kw.occurrenceCount ?? 1;
      const size = Math.max(3, Math.min(14, 3 + Math.log2(count + 1) * 3));
      nodeMap.set(kw.id, {
        id: kw.id,
        label: kw.canonical,
        type: 'keyword',
        heat: 0,
        noteCount: 0,
        size,
        color: keywordColor(kw.entityType),
        entityType: kw.entityType ?? undefined,
        description: kw.entityType ? `类型: ${kw.entityType} · 出现 ${count} 次` : `出现 ${count} 次`
      });
    }
  }

  let activeNodeIds: Set<string> | null = null;
  if (filterTerm) {
    const lower = filterTerm.toLowerCase();
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

  // 添加 note ↔ keyword 关联边
  if (showKeywords) {
    for (const nk of noteKeywordLinks) {
      if (!validIds.has(nk.noteId) || !validIds.has(nk.keywordId)) continue;
      const key = `${nk.noteId}-${nk.keywordId}-note_has_keyword`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      links.push({
        source: nk.noteId,
        target: nk.keywordId,
        relationType: 'note_has_keyword',
        weight: nk.relevance ?? 0.5,
        color: RELATION_COLORS.note_has_keyword
      });
    }
    // 添加 keyword → primaryTopic 关联边
    for (const kw of keywordNodes) {
      if (!kw.primaryTopicId) continue;
      if (!validIds.has(kw.id) || !validIds.has(kw.primaryTopicId)) continue;
      const key = `${kw.id}-${kw.primaryTopicId}-keyword_to_topic`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      links.push({
        source: kw.id,
        target: kw.primaryTopicId,
        relationType: 'keyword_to_topic',
        weight: 0.6,
        color: RELATION_COLORS.keyword_to_topic
      });
    }
  }

  return { nodes: filteredNodes, links };
}

// ━━ Detail Panel (enriched with topic/note details) ━━

function DetailPanel({
  node,
  onClose,
  onFocusTopic,
  workspaceId
}: {
  node: GraphNode | null;
  onClose: () => void;
  onFocusTopic?: (topicId: string) => void;
  workspaceId: string;
}): React.ReactElement | null {
  const [topicDetail, setTopicDetail] = useState<TopicDetail | null>(null);
  const [noteDetail, setNoteDetail] = useState<NoteDetail | null>(null);
  const [sectionContent, setSectionContent] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setTopicDetail(null);
    setNoteDetail(null);
    setSectionContent(null);
    setActiveSection(null);
    if (!node) return;

    setDetailLoading(true);
    if (node.type === 'topic') {
      Promise.all([
        window.YUA.memory.topics({ topicId: node.id, action: 'notes', workspaceId, limit: 10 }),
        window.YUA.memory.topics({ topicId: node.id, action: 'related', workspaceId, limit: 10 }),
        window.YUA.memory.topics({ topicId: node.id, action: 'children', workspaceId, limit: 10 })
      ])
        .then(([notesResult, relatedResult, childrenResult]) => {
          setTopicDetail({
            topic: notesResult?.topic ?? relatedResult?.topic ?? childrenResult?.topic,
            notes: notesResult?.notes ?? [],
            related: relatedResult?.related ?? [],
            children: childrenResult?.children ?? []
          });
        })
        .catch(console.error)
        .finally(() => setDetailLoading(false));
    } else if (node.type === 'note') {
      window.YUA.memory
        .get({ noteId: node.id })
        .then((result: NoteDetail | null) => setNoteDetail(result))
        .catch(console.error)
        .finally(() => setDetailLoading(false));
    } else {
      // keyword: no extra detail to fetch
      setDetailLoading(false);
    }
  }, [node, workspaceId]);

  const handleSectionClick = useCallback(
    (heading: string) => {
      if (!node || activeSection === heading) {
        setSectionContent(null);
        setActiveSection(null);
        return;
      }
      setActiveSection(heading);
      window.YUA.memory
        .get({ noteId: node.id, section: heading })
        .then((result: NoteDetail | null) => {
          setSectionContent(result?.content ?? null);
        })
        .catch(console.error);
    },
    [node, activeSection]
  );

  if (!node) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-background/95 backdrop-blur-sm border-l border-border shadow-lg z-20 flex flex-col">
      <div className="p-4 border-b border-border/50 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {node.type === 'topic' ? (
              <TbTopologyRing className="h-4 w-4 text-violet-500" />
            ) : node.type === 'keyword' ? (
              <TbTag className="h-4 w-4 text-green-500" />
            ) : (
              <TbNote className="h-4 w-4 text-blue-500" />
            )}
            <span className="text-xs font-medium text-muted-foreground uppercase">{node.type === 'topic' ? '主题' : node.type === 'keyword' ? '关键词' : '笔记'}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <TbX className="h-3.5 w-3.5" />
          </Button>
        </div>

        <h3 className="text-base font-semibold mb-2 break-words">{node.label}</h3>

        {node.description && <p className="text-sm text-muted-foreground mb-3 break-words leading-relaxed">{node.description}</p>}

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
          {node.type === 'keyword' && node.entityType && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">实体类型</span>
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] border" style={{ borderColor: keywordColor(node.entityType), color: keywordColor(node.entityType) }}>
                {node.entityType}
              </span>
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

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {detailLoading && (
            <div className="flex items-center justify-center py-4">
              <TbLoader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Topic details: related notes, children, related topics */}
          {node.type === 'topic' && topicDetail && (
            <>
              {topicDetail.notes && topicDetail.notes.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <TbNote className="h-3 w-3" />
                    关联记忆
                  </div>
                  <div className="space-y-2">
                    {topicDetail.notes.map((note) => (
                      <div key={note.id} className="rounded-lg border border-border/50 p-2.5 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                          <TbCalendar className="h-3 w-3" />
                          <span>{note.date}</span>
                          <span className="ml-auto flex items-center gap-0.5">
                            <TbStar className="h-3 w-3" />
                            {(note.importance * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-foreground/80">{note.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topicDetail.children && topicDetail.children.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">子主题</div>
                  <div className="space-y-1">
                    {topicDetail.children.map((child) => (
                      <button
                        key={child.id}
                        className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-muted/50 text-xs flex items-center justify-between group transition-colors"
                        onClick={() => onFocusTopic?.(child.id)}
                      >
                        <span className="flex items-center gap-1.5">
                          <TbTopologyRing className="h-3 w-3 text-violet-400" />
                          {child.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          {child.noteCount ?? 0} 笔记
                          <TbChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {topicDetail.related && topicDetail.related.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">关联主题</div>
                  <div className="space-y-1">
                    {topicDetail.related.map((rel) => (
                      <button
                        key={rel.id}
                        className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-muted/50 text-xs flex items-center justify-between group transition-colors"
                        onClick={() => onFocusTopic?.(rel.id)}
                      >
                        <span className="flex items-center gap-1.5">
                          <TbArrowRight className="h-3 w-3 text-teal-400" />
                          {rel.label}
                        </span>
                        <TbChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Note details: sections outline + content preview */}
          {node.type === 'note' && noteDetail && (
            <>
              {noteDetail.topics && noteDetail.topics.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">所属主题</div>
                  <div className="flex flex-wrap gap-1">
                    {noteDetail.topics.map((t, i) => (
                      <span key={i} className="inline-flex px-2 py-0.5 rounded-full text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {noteDetail.outline && noteDetail.outline.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <TbFileText className="h-3 w-3" />
                    内容大纲（点击展开）
                  </div>
                  <div className="space-y-1">
                    {noteDetail.outline.map((sec, i) => (
                      <div key={i}>
                        <button
                          className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${activeSection === sec.heading ? 'bg-blue-500/10 border border-blue-500/20' : 'hover:bg-muted/50'}`}
                          style={{ paddingLeft: `${(sec.level - 1) * 12 + 10}px` }}
                          onClick={() => handleSectionClick(sec.heading)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground/80">{sec.heading}</span>
                            <span className="text-[10px] text-muted-foreground">{sec.charCount} 字</span>
                          </div>
                          {sec.summary && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{sec.summary}</p>}
                        </button>
                        {activeSection === sec.heading && sectionContent && (
                          <div className="mx-2 mt-1 mb-2 p-2.5 rounded-md bg-muted/30 border border-border/50 text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                            {sectionContent}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ━━ Search Panel ━━

function SearchPanel({
  workspaceId,
  onHighlightNote,
  onSearchResults
}: {
  workspaceId: string;
  onHighlightNote: (noteId: string) => void;
  onSearchResults: (result: SearchResult | null) => void;
}): React.ReactElement {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim() || !workspaceId) {
        setResult(null);
        onSearchResults(null);
        return;
      }
      setSearching(true);
      try {
        const res = await window.YUA.memory.search({ query: q, workspaceId, maxResults: 10, includeContent: true });
        setResult(res);
        onSearchResults(res);
      } catch (e) {
        console.error('[MemoryGraph] search failed:', e);
        setResult(null);
        onSearchResults(null);
      } finally {
        setSearching(false);
      }
    },
    [workspaceId, onSearchResults]
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 400);
    },
    [doSearch]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border/50 shrink-0">
        <div className="relative">
          <TbSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="搜索记忆内容（支持主题、关键词、时间...）"
            className="h-8 pl-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') doSearch(query);
            }}
          />
          {query && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setQuery('');
                setResult(null);
                onSearchResults(null);
              }}
            >
              <TbX className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          {searching && (
            <div className="flex items-center justify-center py-8">
              <TbLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!searching && !result && !query && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <TbSearch className="h-8 w-8 opacity-20" />
              <p className="text-xs">输入关键词快速检索记忆</p>
              <p className="text-[10px] text-muted-foreground/60">支持：主题名、关键词、时间描述（如"最近"、"上周"）</p>
            </div>
          )}

          {!searching && result && (
            <div className="space-y-4">
              <div className="text-[10px] text-muted-foreground">找到 {result.totalFound} 条记忆</div>

              {result.topics.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <TbTopologyRing className="h-3 w-3 text-violet-400" />
                    <span>匹配主题</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.topics.map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        {t.label}
                        <span className="text-violet-400/50">{(t.heat * 100).toFixed(0)}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.notes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <TbNote className="h-3 w-3 text-blue-400" />
                    <span>匹配记忆</span>
                  </div>
                  {result.notes.map((note) => (
                    <button key={note.id} className="w-full text-left rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors" onClick={() => onHighlightNote(note.id)}>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1.5">
                        <TbCalendar className="h-3 w-3" />
                        <span>{note.date}</span>
                        <span className="ml-auto flex items-center gap-0.5">
                          <TbStar className="h-3 w-3" />
                          {(note.importance * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {note.topics.map((t, i) => (
                          <span key={i} className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-violet-500/10 text-violet-300/80">
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">{note.summary}</p>
                      {note.sections && note.sections.length > 0 && (
                        <div className="mt-2 pl-2 border-l-2 border-border/50 space-y-1">
                          {note.sections.slice(0, 3).map((sec, i) => (
                            <div key={i} className="text-[10px] text-muted-foreground">
                              <span className="font-medium text-foreground/60">{sec.heading}</span>
                              {sec.summary && <span> — {sec.summary.slice(0, 60)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {result.totalFound === 0 && (
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <TbBrain className="h-8 w-8 opacity-20" />
                  <p className="text-xs">未找到匹配的记忆</p>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ━━ Notes List Panel ━━

function NotesListPanel({ workspaceId, onHighlightNote }: { workspaceId: string; onHighlightNote: (noteId: string) => void }): React.ReactElement {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    window.YUA.memory
      .listNotes({ workspaceId, limit: 200, offset: 0 })
      .then((result: any[]) => setNotes(result ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <TbLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <TbNote className="h-8 w-8 opacity-20" />
        <p className="text-xs">暂无记忆笔记</p>
      </div>
    );
  }

  // Group by date
  const grouped = new Map<string, any[]>();
  for (const note of notes) {
    const date = note.date || 'unknown';
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(note);
  }

  const sortedDates = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        <div className="text-[10px] text-muted-foreground">共 {notes.length} 条记忆笔记</div>
        {sortedDates.map((date) => (
          <div key={date}>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5 sticky top-0 bg-background/95 py-1">
              <TbCalendar className="h-3 w-3" />
              {date}
              <span className="text-[10px] text-muted-foreground/60">({grouped.get(date)!.length})</span>
            </div>
            <div className="space-y-2">
              {grouped.get(date)!.map((note) => {
                const topics = safeJsonParse(note.topics);
                const keywords = safeJsonParse(note.keywords);
                return (
                  <button key={note.id} className="w-full text-left rounded-lg border border-border/50 p-2.5 hover:bg-muted/30 transition-colors" onClick={() => onHighlightNote(note.id)}>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {topics.map((t: string, i: number) => (
                        <span key={i} className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-violet-500/10 text-violet-300/80">
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed line-clamp-2">{note.summary}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <TbStar className="h-3 w-3" />
                        {((note.importance ?? 0.5) * 100).toFixed(0)}%
                      </span>
                      {keywords.length > 0 && <span className="truncate">{keywords.slice(0, 3).join(', ')}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
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
  const [rawKeywords, setRawKeywords] = useState<KeywordNode[]>([]);
  const [rawNoteKeywords, setRawNoteKeywords] = useState<NoteKeywordLink[]>([]);
  const [showNotes, setShowNotes] = useState(true);
  const [showKeywords, setShowKeywords] = useState(false);
  const [filterTerm, setFilterTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [focusTopicId, setFocusTopicId] = useState<string | undefined>();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('search');
  const [memoryStats, setMemoryStats] = useState<{ noteCount: number; topicCount: number; edgeCount: number } | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [highlightedLinkKeys, setHighlightedLinkKeys] = useState<Set<string>>(new Set());

  // ━━ Load workspace ━━

  useEffect(() => {
    window.YUA.workspace['workspace:getDefault']()
      .then((ws: any) => {
        if (ws?.id) setWorkspaceId(ws.id);
      })
      .catch(console.error);
  }, []);

  // ━━ Load data ━━

  const loadGraphData = useCallback(
    async (topicId?: string) => {
      setLoading(true);
      try {
        const result = await window.YUA.memory.graphData({ topicId, workspaceId: workspaceId || undefined, includeNotes: true, includeKeywords: true, maxTopics: 200, maxEdges: 500 });
        setRawTopics(result.topics ?? []);
        setRawEdges(result.edges ?? []);
        setRawNotes(result.notes ?? []);
        setRawKeywords(result.keywords ?? []);
        setRawNoteKeywords(result.noteKeywords ?? []);
        setFocusTopicId(topicId);
      } catch (err) {
        console.error('[MemoryGraph] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    if (workspaceId) {
      loadGraphData();
      window.YUA.memory
        .stats({ workspaceId })
        .then((s: any) => setMemoryStats(s))
        .catch(console.error);
    }
  }, [workspaceId, loadGraphData]);

  // ━━ Rebuild graph when raw data or filters change ━━

  useEffect(() => {
    const data = buildGraphData(rawTopics, rawEdges, rawNotes, showNotes, filterTerm, rawKeywords, rawNoteKeywords, showKeywords);
    setGraphData(data);
  }, [rawTopics, rawEdges, rawNotes, showNotes, filterTerm, rawKeywords, rawNoteKeywords, showKeywords]);

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

  const hasHighlight = highlightedNodeIds.size > 0;

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const isHovered = hoveredNode?.id === n.id;
      const isSelected = selectedNode?.id === n.id;
      const isFaded = filterTerm && !graphData.nodes.find((gn) => gn.id === n.id);
      const isHighlighted = hasHighlight && highlightedNodeIds.has(n.id);
      const isDimmed = hasHighlight && !isHighlighted && !isHovered && !isSelected;

      ctx.save();

      // 搜索高亮时，非命中节点整体压暗
      if (isDimmed) ctx.globalAlpha = 0.15;

      if (n.type === 'topic') {
        const baseSize = n.size;
        const drawSize = isHighlighted ? baseSize * 1.25 : isHovered || isSelected ? baseSize * 1.2 : baseSize;

        // 高亮光晕
        if (isHighlighted) {
          ctx.beginPath();
          ctx.arc(x, y, drawSize + 8, 0, 2 * Math.PI);
          const glow = ctx.createRadialGradient(x, y, drawSize, x, y, drawSize + 8);
          glow.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
          glow.addColorStop(1, 'rgba(139, 92, 246, 0)');
          ctx.fillStyle = glow;
          ctx.fill();
        }

        if ((isSelected || isHovered) && !isHighlighted) {
          ctx.beginPath();
          ctx.arc(x, y, drawSize + 4, 0, 2 * Math.PI);
          ctx.fillStyle = `${n.color}33`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, drawSize, 0, 2 * Math.PI);
        ctx.fillStyle = isFaded ? `${n.color}44` : isHighlighted ? n.color : n.color;
        ctx.fill();

        ctx.strokeStyle = isHighlighted ? '#e0e7ff' : isSelected ? '#fff' : `${n.color}88`;
        ctx.lineWidth = isHighlighted ? 2.5 : isSelected ? 2 : 1;
        ctx.stroke();

        const fontSize = Math.max(10, Math.min(14, 10 + n.noteCount));
        const scaledFont = (isHighlighted ? fontSize + 1 : fontSize) / globalScale;
        ctx.font = `${isHighlighted ? '700' : '600'} ${scaledFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textWidth = ctx.measureText(n.label).width;
        const textY = y + drawSize + scaledFont * 0.8;
        ctx.fillStyle = isHighlighted ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x - textWidth / 2 - 2 / globalScale, textY - scaledFont * 0.5, textWidth + 4 / globalScale, scaledFont * 1.1);

        ctx.fillStyle = isFaded ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.95)';
        ctx.fillText(n.label, x, textY);
      } else if (n.type === 'keyword') {
        // 关键词节点：圆角矩形（标签形状）
        const baseSize = n.size;
        const drawSize = isHighlighted ? baseSize * 1.4 : isHovered || isSelected ? baseSize * 1.2 : baseSize;
        const w = drawSize * 2.5;
        const h = drawSize * 1.6;
        const r = drawSize * 0.4;

        if (isHighlighted) {
          ctx.beginPath();
          ctx.roundRect(x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6, r + 2);
          const glow = ctx.createRadialGradient(x, y, drawSize * 0.3, x, y, drawSize * 2);
          glow.addColorStop(0, `${n.color}66`);
          glow.addColorStop(1, `${n.color}00`);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        if ((isSelected || isHovered) && !isHighlighted) {
          ctx.beginPath();
          ctx.roundRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, r + 1);
          ctx.fillStyle = `${n.color}22`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
        ctx.fillStyle = isFaded ? `${n.color}44` : isHighlighted ? n.color : `${n.color}cc`;
        ctx.fill();
        ctx.strokeStyle = isHighlighted ? '#e0e7ff' : isSelected ? '#fff' : `${n.color}88`;
        ctx.lineWidth = isHighlighted ? 2 : isSelected ? 1.5 : 0.5;
        ctx.stroke();

        // 关键词标签文字（始终显示）
        const scaledFont = Math.max(8, drawSize * 0.9) / globalScale;
        ctx.font = `${isHighlighted ? '600' : '500'} ${scaledFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isFaded ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.95)';
        const maxLabelLen = Math.floor((w * globalScale) / (scaledFont * globalScale * 0.6));
        const kwLabel = n.label.length > maxLabelLen ? n.label.slice(0, maxLabelLen - 1) + '…' : n.label;
        ctx.fillText(kwLabel, x, y);
      } else {
        const size = n.size;
        const drawSize = isHighlighted ? size * 1.5 : isHovered || isSelected ? size * 1.3 : size;

        // 高亮光晕
        if (isHighlighted) {
          ctx.beginPath();
          ctx.moveTo(x, y - drawSize - 6);
          ctx.lineTo(x + drawSize + 6, y);
          ctx.lineTo(x, y + drawSize + 6);
          ctx.lineTo(x - drawSize - 6, y);
          ctx.closePath();
          const glow = ctx.createRadialGradient(x, y, drawSize * 0.5, x, y, drawSize + 6);
          glow.addColorStop(0, 'rgba(59, 130, 246, 0.45)');
          glow.addColorStop(1, 'rgba(59, 130, 246, 0)');
          ctx.fillStyle = glow;
          ctx.fill();
        }

        if ((isSelected || isHovered) && !isHighlighted) {
          ctx.beginPath();
          ctx.moveTo(x, y - drawSize - 3);
          ctx.lineTo(x + drawSize + 3, y);
          ctx.lineTo(x, y + drawSize + 3);
          ctx.lineTo(x - drawSize - 3, y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.moveTo(x, y - drawSize);
        ctx.lineTo(x + drawSize, y);
        ctx.lineTo(x, y + drawSize);
        ctx.lineTo(x - drawSize, y);
        ctx.closePath();
        ctx.fillStyle = isFaded ? `${n.color}44` : isHighlighted ? 'rgba(96, 165, 250, 1)' : n.color;
        ctx.fill();
        ctx.strokeStyle = isHighlighted ? '#e0e7ff' : isSelected ? '#fff' : 'rgba(59, 130, 246, 0.5)';
        ctx.lineWidth = isHighlighted ? 2 : isSelected ? 1.5 : 0.5;
        ctx.stroke();

        // Show label for highlighted/hovered/selected notes
        if ((isHighlighted || isHovered || isSelected) && (isHighlighted || globalScale > 1.5)) {
          const scaledFont = (isHighlighted ? 10 : 9) / globalScale;
          ctx.font = `${isHighlighted ? '600' : '400'} ${scaledFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const label = n.label.slice(0, 30);
          const textWidth = ctx.measureText(label).width;
          const textY = y + drawSize + scaledFont * 0.8;
          ctx.fillStyle = isHighlighted ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(x - textWidth / 2 - 2 / globalScale, textY - scaledFont * 0.5, textWidth + 4 / globalScale, scaledFont * 1.1);
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.fillText(label, x, textY);
        }
      }

      ctx.restore();
    },
    [hoveredNode, selectedNode, filterTerm, graphData.nodes, hasHighlight, highlightedNodeIds]
  );

  // ━━ Link rendering ━━

  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => {
      const l = link as any;
      const source = l.source;
      const target = l.target;
      if (!source?.x || !target?.x) return;

      const sourceId = typeof source === 'object' ? source.id : source;
      const targetId = typeof target === 'object' ? target.id : target;
      const linkKey = `${sourceId}-${targetId}`;
      const linkKeyReverse = `${targetId}-${sourceId}`;
      const isLinkHighlighted = hasHighlight && (highlightedLinkKeys.has(linkKey) || highlightedLinkKeys.has(linkKeyReverse));
      const isLinkDimmed = hasHighlight && !isLinkHighlighted;

      ctx.save();

      if (isLinkHighlighted) {
        // 高亮经络：亮色发光线条
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.15)';
        ctx.lineWidth = Math.max(4, (l.weight || 1) * 3);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.9)';
        ctx.lineWidth = Math.max(1.5, (l.weight || 1) * 1.2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = isLinkDimmed ? 0.08 : 1;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = l.color || 'rgba(148, 163, 184, 0.3)';
        ctx.lineWidth = Math.max(0.5, (l.weight || 1) * 0.8);
        ctx.stroke();
      }

      ctx.restore();
    },
    [hasHighlight, highlightedLinkKeys]
  );

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

  // ━━ Handle search results → build highlight set ━━

  const handleSearchResults = useCallback(
    (result: SearchResult | null) => {
      if (!result || (result.notes.length === 0 && result.topics.length === 0)) {
        setHighlightedNodeIds(new Set());
        setHighlightedLinkKeys(new Set());
        return;
      }

      const hitIds = new Set<string>();

      // Collect matched note IDs
      for (const note of result.notes) {
        hitIds.add(note.id);
      }

      // Match search-result topic labels to graph topic nodes
      const topicLabels = new Set(result.topics.map((t) => t.label.toLowerCase()));
      for (const t of rawTopics) {
        if (topicLabels.has(t.label.toLowerCase())) {
          hitIds.add(t.id);
        }
      }

      // Also match note.topics (string[]) to topic nodes for richer connectivity
      for (const note of result.notes) {
        for (const topicLabel of note.topics) {
          const lower = topicLabel.toLowerCase();
          for (const t of rawTopics) {
            if (t.label.toLowerCase() === lower) {
              hitIds.add(t.id);
            }
          }
        }
      }

      // Build link keys: edges where BOTH endpoints are highlighted
      const linkKeys = new Set<string>();
      for (const edge of rawEdges) {
        if (hitIds.has(edge.sourceId) && hitIds.has(edge.targetId)) {
          linkKeys.add(`${edge.sourceId}-${edge.targetId}`);
        }
      }

      setHighlightedNodeIds(hitIds);
      setHighlightedLinkKeys(linkKeys);
    },
    [rawTopics, rawEdges]
  );

  // ━━ Highlight a note in the graph ━━

  const handleHighlightNote = useCallback(
    (noteId: string) => {
      const node = graphData.nodes.find((n) => n.id === noteId);
      if (node) {
        setSelectedNode(node);
        fgRef.current?.centerAt(node.x, node.y, 500);
        fgRef.current?.zoom(3, 500);
      } else {
        // Note not visible, enable showNotes and try again
        if (!showNotes) {
          setShowNotes(true);
          setTimeout(() => {
            const retryNode = graphData.nodes.find((n) => n.id === noteId);
            if (retryNode) {
              setSelectedNode(retryNode);
              fgRef.current?.centerAt(retryNode.x, retryNode.y, 500);
              fgRef.current?.zoom(3, 500);
            }
          }, 300);
        }
      }
    },
    [graphData.nodes, showNotes]
  );

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
    setFilterTerm('');
    setHighlightedNodeIds(new Set());
    setHighlightedLinkKeys(new Set());
    loadGraphData(focusTopicId);
    if (workspaceId) {
      window.YUA.memory
        .stats({ workspaceId })
        .then((s: any) => setMemoryStats(s))
        .catch(console.error);
    }
  }, [loadGraphData, focusTopicId, workspaceId]);

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

  const stats = useMemo(() => ({ topics: rawTopics.length, notes: rawNotes.length, edges: rawEdges.length, keywords: rawKeywords.length }), [rawTopics, rawNotes, rawEdges, rawKeywords]);

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
            {memoryStats && (
              <span className="text-[10px] text-muted-foreground font-normal ml-1">
                {memoryStats.noteCount} 条记忆 · {memoryStats.topicCount} 个主题 · {memoryStats.edgeCount} 条关系
              </span>
            )}
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
              <Input value={filterTerm} onChange={(e) => setFilterTerm(e.target.value)} placeholder="过滤图谱节点..." className="h-7 w-36 pl-7 text-xs" />
              {filterTerm && (
                <button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setFilterTerm('')}>
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
                <div className="flex items-center gap-1.5 px-2">
                  <TbTag className="h-3.5 w-3.5 text-muted-foreground" />
                  <Switch checked={showKeywords} onCheckedChange={setShowKeywords} className="scale-75" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">显示关键词节点</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarOpen((v) => !v)}>
                  <TbLayoutSidebar className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">切换侧边栏</TooltipContent>
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

      <div className="flex-1 flex overflow-hidden">
        {/* ━━ Left Sidebar: Search & Notes ━━ */}
        {sidebarOpen && (
          <div className="w-72 shrink-0 border-r border-border bg-background/50 flex flex-col">
            <div className="flex border-b border-border/50 shrink-0">
              <button
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${sidebarTab === 'search' ? 'text-foreground border-b-2 border-violet-500' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setSidebarTab('search')}
              >
                <TbSearch className="h-3.5 w-3.5" />
                记忆搜索
              </button>
              <button
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${sidebarTab === 'notes' ? 'text-foreground border-b-2 border-blue-500' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setSidebarTab('notes')}
              >
                <TbList className="h-3.5 w-3.5" />
                笔记列表
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {sidebarTab === 'search' && <SearchPanel workspaceId={workspaceId} onHighlightNote={handleHighlightNote} onSearchResults={handleSearchResults} />}
              {sidebarTab === 'notes' && <NotesListPanel workspaceId={workspaceId} onHighlightNote={handleHighlightNote} />}
            </div>
          </div>
        )}

        {/* ━━ Graph Area ━━ */}
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
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm rotate-45" style={{ background: '#3b82f6' }} />
              笔记 {stats.notes}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1.5 rounded-sm" style={{ background: '#22c55e' }} />
              关键词 {stats.keywords}
            </span>
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
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-sm rotate-45" style={{ background: '#3b82f6' }} />
              <span>记忆笔记</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-1.5 rounded-sm" style={{ background: '#22c55e' }} />
              <span>关键词</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground/60">
              <span>节点大小 = 关联数量</span>
            </div>
          </div>

          <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} onFocusTopic={handleFocusTopic} workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  );
}
