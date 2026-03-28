/**
 * 工具调用活动指示器
 * 在 AI 回复时展示工具调用状态（调用中 / 已完成），支持折叠查看参数和结果
 * pushCardTool 的调用会直接渲染为资源卡片
 */

import { useState } from 'react';
import { TbCheck, TbChevronDown, TbChevronRight, TbLoader2, TbTool } from 'react-icons/tb';

import { ResourceCard } from './cards';

export interface ToolActivity {
  callId: string;
  name: string;
  args?: any;
  status: 'calling' | 'done';
  result?: any;
  progress?: number;
  progressMessage?: string;
}

interface ToolCallActivityProps {
  activities: ToolActivity[];
}

const ToolCallActivity: React.FC<ToolCallActivityProps> = ({ activities }) => {
  if (activities.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 mb-1">
      {activities.map((a) => (
        <ToolCallItem key={a.callId} activity={a} />
      ))}
    </div>
  );
};

function formatValue(val: any, max = 2000): { text: string; lang?: string } {
  const s = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
  const truncated = s.length > max ? s.slice(0, max) + '…' : s;
  // Detect code-like content: JSON objects/arrays, or content with code indicators
  if (typeof val === 'object' && val !== null) return { text: truncated, lang: 'json' };
  if (typeof val === 'string' && /^[\[{]/.test(val.trim())) return { text: truncated, lang: 'json' };
  if (typeof val === 'string' && /(function |=>|import |const |let |var |class |def |#include)/.test(val)) return { text: truncated, lang: '' };
  return { text: truncated };
}

const CARD_TOOL_NAMES = new Set(['pushCardTool', 'push-card']);

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  toolboxLookupTool: '查阅工具箱',
  resourceQueryTool: '查询资源',
  translationTool: '翻译字幕',
  summaryTool: '总结内容',
  readSubtitleTool: '读取字幕',
  youtubeDownloadTool: '下载视频',
  youtubeSubscribeTool: '订阅频道',
  memorySearchTool: '搜索记忆',
  memoryGetTool: '获取记忆',
  memoryTopicsTool: '浏览记忆主题',
  memorySaveTool: '保存记忆',
  workflowRunTool: '执行工作流'
};

function getToolDisplayName(name: string, args?: any): string {
  if (name === 'toolboxLookupTool' && args) {
    const a = typeof args === 'string' ? JSON.parse(args) : args;
    const action = a?.action;
    const query = a?.query;
    if (action === 'search' && query) return `查阅工具箱：搜索"${query}"`;
    if (action === 'get' && query) return `查阅工具箱：获取"${query}"`;
    if (action === 'list') return '查阅工具箱：列出技能';
  }
  if (name === 'workflowRunTool' && args) {
    const a = typeof args === 'string' ? JSON.parse(args) : args;
    const action = a?.action;
    if (action === 'list') return '查找工作流：列出全部';
    if (action === 'search' && a?.query) return `查找工作流：搜索"${a.query}"`;
    if (action === 'run' && a?.workflowId) return `执行工作流：${a.workflowId}`;
  }
  return TOOL_DISPLAY_NAMES[name] || name;
}

const CardToolItem: React.FC<{ activity: ToolActivity }> = ({ activity }) => {
  const args = typeof activity.args === 'string' ? JSON.parse(activity.args) : activity.args;
  if (!args) return null;
  return (
    <div className="py-0.5">
      {args.text && <div className="text-xs text-muted-foreground mb-1">{args.text}</div>}
      <ResourceCard resourceId={args.resourceId} data={args.data} cardType={args.type} compact />
    </div>
  );
};

const ToolCallItem: React.FC<{ activity: ToolActivity }> = ({ activity }) => {
  if (CARD_TOOL_NAMES.has(activity.name)) return <CardToolItem activity={activity} />;

  const [expanded, setExpanded] = useState(false);
  const displayName = getToolDisplayName(activity.name, activity.args);
  const hasProgress = activity.status === 'calling' && activity.progress !== undefined && activity.progress > 0;

  return (
    <div className="text-xs border border-border/50 rounded-lg overflow-hidden">
      <button className="flex items-center gap-1.5 px-2 py-1 hover:bg-muted/50 transition-colors text-left" onClick={() => setExpanded(!expanded)}>
        {activity.status === 'calling' ? (
          hasProgress ? (
            <CircularProgress size={12} progress={activity.progress!} />
          ) : (
            <TbLoader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />
          )
        ) : (
          <TbCheck className="h-3 w-3 text-green-500 shrink-0" />
        )}
        <TbTool className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground truncate">
          {activity.status === 'calling'
            ? hasProgress
              ? `${displayName} ${Math.round(activity.progress!)}%${activity.progressMessage ? ` - ${activity.progressMessage}` : ''}`
              : `${displayName} ...`
            : `${displayName} 完成`}
        </span>
        {expanded ? <TbChevronDown className="h-3 w-3" /> : <TbChevronRight className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="px-2 py-1 bg-muted/30 border-t border-border/50 space-y-1 max-h-64 overflow-auto">
          {activity.args != null && <DetailBlock label="参数" value={activity.args} />}
          {activity.status === 'done' && activity.result != null && <DetailBlock label="结果" value={activity.result} />}
        </div>
      )}
    </div>
  );
};

const CircularProgress: React.FC<{ size: number; progress: number }> = ({ size, progress }) => {
  const strokeWidth = 1.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90" viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted-foreground/30" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-blue-500 transition-all duration-300"
      />
    </svg>
  );
};

const DetailBlock: React.FC<{ label: string; value: any }> = ({ label, value }) => {
  const { text, lang } = formatValue(value);
  return (
    <div>
      <div className="text-[10px] text-muted-foreground font-medium mb-0.5">{label}</div>
      {lang !== undefined ? (
        <pre className="text-[11px] whitespace-pre-wrap break-all text-foreground/90 bg-background/60 rounded p-1.5 border border-border/30 overflow-x-auto">
          <code>{text}</code>
        </pre>
      ) : (
        <pre className="text-[10px] whitespace-pre-wrap break-all text-foreground/80">{text}</pre>
      )}
    </div>
  );
};

export default ToolCallActivity;
