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

  return (
    <div className="text-xs border border-border/50 rounded-lg overflow-hidden">
      <button className="flex items-center gap-1.5 w-full px-2 py-1 hover:bg-muted/50 transition-colors text-left" onClick={() => setExpanded(!expanded)}>
        {activity.status === 'calling' ? <TbLoader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" /> : <TbCheck className="h-3 w-3 text-green-500 shrink-0" />}
        <TbTool className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground truncate">{activity.status === 'calling' ? `调用 ${activity.name} ...` : `${activity.name} 完成`}</span>
        <span className="ml-auto shrink-0">{expanded ? <TbChevronDown className="h-3 w-3" /> : <TbChevronRight className="h-3 w-3" />}</span>
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
