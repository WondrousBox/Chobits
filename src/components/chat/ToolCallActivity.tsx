/* eslint-disable react/prop-types */
/**
 * 工具调用活动指示器
 * 在 AI 回复时展示工具调用状态（调用中 / 已完成），支持折叠查看参数和结果。
 * pushCardTool 的调用会直接渲染为资源卡片。
 */

import { LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID, LONG_TASK_BACKGROUND_CHOICE_VALUE, type ToolCallDisplay, type UserChoiceRequest } from '@packages/ai/types';
import { useState } from 'react';
import { TbCheck, TbChevronDown, TbChevronRight, TbClock, TbCopy, TbLoader2, TbTool } from 'react-icons/tb';

import { ResourceCard } from './cards';
import UserChoiceCard from './UserChoiceCard';

export interface ToolActivity {
  callId: string;
  name: string;
  label?: string;
  args?: any;
  status: 'calling' | 'done';
  result?: any;
  progress?: number;
  progressMessage?: string;
  display?: ToolCallDisplay;
  choiceRequest?: UserChoiceRequest;
  choiceAnswers?: Record<string, string[]>;
}

interface ToolCallActivityProps {
  activities: ToolActivity[];
  onUserChoiceSubmit?: (choiceId: string, answers: Record<string, string[]>) => void;
}

const CARD_TOOL_NAMES = new Set(['pushCardTool', 'push-card']);
const ASK_USER_TOOL_NAMES = new Set(['askUserTool', 'ask-user']);
const EMOJI_SEND_TOOL_NAMES = new Set(['emojiSendTool', 'emoji-send']);

const ToolCallActivity: React.FC<ToolCallActivityProps> = ({ activities, onUserChoiceSubmit }) => {
  const visibleActivities = activities.filter(isRenderableToolActivity);
  if (visibleActivities.length === 0) return null;

  return (
    <div className="mb-1 flex flex-col gap-1">
      {visibleActivities.map((activity) => (
        <ToolCallItem key={activity.callId} activity={activity} onUserChoiceSubmit={onUserChoiceSubmit} />
      ))}
    </div>
  );
};

function isRenderableToolActivity(activity: ToolActivity): boolean {
  if (activity.display?.mode === 'hidden') return false;
  if (activity.display?.mode === 'content-only' && EMOJI_SEND_TOOL_NAMES.has(activity.name) && activity.status !== 'done') return false;
  return true;
}

function stringifyValue(val: any): string {
  if (typeof val === 'string') return val;
  try {
    const json = JSON.stringify(val, null, 2);
    if (typeof json === 'string') return json;
  } catch {
    // Fall back to a best-effort string representation for non-JSON values.
  }
  return String(val);
}

async function copyValueToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path below.
    }
  }

  if (typeof document === 'undefined' || typeof document.createElement !== 'function' || !document.body) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.select();
    const legacyDocument = document as Document & { execCommand?: (command: string) => boolean };
    return legacyDocument.execCommand?.('copy') ?? false;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function formatValue(val: any, max = 2000): { text: string; lang?: string } {
  const s = stringifyValue(val);
  const truncated = s.length > max ? `${s.slice(0, max)}...` : s;
  if (typeof val === 'object' && val !== null) return { text: truncated, lang: 'json' };
  if (typeof val === 'string' && /^[{[]/.test(val.trim())) return { text: truncated, lang: 'json' };
  if (typeof val === 'string' && /(function |=>|import |const |let |var |class |def |#include)/.test(val)) return { text: truncated, lang: '' };
  return { text: truncated };
}

function parseToolArgs(args: any): any {
  if (typeof args !== 'string') return args;
  try {
    return JSON.parse(args);
  } catch {
    return undefined;
  }
}

function readToolDetails(result: any): any {
  return result?.details || result;
}

function allowToolImageUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (/^(https?:|res:|blob:)/i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(trimmed)) return trimmed;
  return '';
}

function getToolDisplayName(activity: ToolActivity): string {
  if (activity.label) return activity.label;
  return activity.name;
}

function isLongTaskChoiceRequest(request?: UserChoiceRequest): boolean {
  if (!request) return false;
  return request.questions.some((question) => question.id === LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID && question.options.some((option) => option.value === LONG_TASK_BACKGROUND_CHOICE_VALUE));
}

function isBackgroundExecutionResult(result: any): boolean {
  return result?.executionMode === 'background' || result?.backgrounded === true;
}

const CardToolItem: React.FC<{ activity: ToolActivity }> = ({ activity }) => {
  const args = parseToolArgs(activity.args);
  if (!args) return null;

  return (
    <div className="py-0.5">
      {args.text && <div className="mb-1 text-xs text-muted-foreground">{args.text}</div>}
      <ResourceCard resourceId={args.resourceId} data={args.data} cardType={args.type} compact />
    </div>
  );
};

function getEmojiArgSummary(args: any): string | undefined {
  const query = typeof args?.query === 'string' ? args.query.trim() : '';
  const packId = typeof args?.packId === 'string' ? args.packId.trim() : '';
  const caption = typeof args?.caption === 'string' ? args.caption.trim() : '';

  if (query) return `query: ${query}`;
  if (caption) return `caption: ${caption}`;
  if (packId) return `packId: ${packId}`;
  return undefined;
}

const EmojiSendToolItem: React.FC<{ activity: ToolActivity }> = ({ activity }) => {
  const [expanded, setExpanded] = useState(false);
  const args = parseToolArgs(activity.args) || {};
  const details = readToolDetails(activity.result) || {};
  const emoji = details.emoji;
  const imageUrl = allowToolImageUrl(emoji?.url || '');
  const title = emoji?.title || args.caption || args.query || '表情包';
  const argSummary = getEmojiArgSummary(args);
  const statusText = activity.status === 'calling' ? '发送表情包...' : details.error && !imageUrl ? '表情包发送失败' : '发送表情包完成';

  if (activity.display?.mode === 'content-only') {
    if (activity.status !== 'done' || !imageUrl) return null;

    return (
      <div className="py-1">
        {(details.caption || args.caption) && <div className="mb-1 text-xs text-muted-foreground">{details.caption || args.caption}</div>}
        <div className="inline-block max-w-full overflow-hidden rounded-lg border border-border/60 bg-muted/30">
          <img src={imageUrl} alt={title} loading="lazy" className="block max-h-[260px] max-w-full object-contain" />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 text-xs">
      <button type="button" className="flex max-w-full items-center gap-1.5 px-2 py-1 text-left transition-colors hover:bg-muted/50" onClick={() => setExpanded(!expanded)}>
        {activity.status === 'calling' ? <TbLoader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" /> : <TbCheck className="h-3 w-3 shrink-0 text-green-500" />}
        <TbTool className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-muted-foreground max-w-52">{statusText}</span>
        {expanded ? <TbChevronDown className="h-3 w-3" /> : <TbChevronRight className="h-3 w-3" />}
      </button>

      {argSummary && !expanded && (
        <div className="border-t border-border/30 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
          <span className="break-all">{argSummary}</span>
        </div>
      )}

      {expanded && (
        <div className="max-h-64 space-y-1 overflow-auto border-t border-border/50 bg-muted/30 px-2 py-1">
          {activity.args != null && <DetailBlock label="参数" value={activity.args} />}
          {activity.status === 'done' && activity.result != null && <DetailBlock label="结果" value={activity.result} />}
        </div>
      )}

      {activity.status === 'done' && (
        <div className="border-t border-border/30 px-2 py-2">
          {(details.caption || args.caption) && <div className="mb-1 text-xs text-muted-foreground">{details.caption || args.caption}</div>}
          {imageUrl ? (
            <div className="inline-block max-w-full overflow-hidden rounded-lg border border-border/60 bg-muted/30">
              <img src={imageUrl} alt={title} loading="lazy" className="block max-h-[260px] max-w-full object-contain" />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">{details.error || '没有找到可展示的表情包'}</div>
          )}
        </div>
      )}
    </div>
  );
};

const AskUserToolItem: React.FC<{ activity: ToolActivity; onSubmit?: (choiceId: string, answers: Record<string, string[]>) => void }> = ({ activity, onSubmit }) => {
  const request = activity.choiceRequest;
  if (!request) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        <TbLoader2 className="h-3 w-3 animate-spin text-blue-500" />
        <span>准备选项...</span>
      </div>
    );
  }

  const submitted = activity.status === 'done';

  return (
    <div className="py-0.5">
      <UserChoiceCard request={request} onSubmit={(answers) => onSubmit?.(request.choiceId, answers)} submitted={submitted} submittedAnswers={activity.choiceAnswers} />
    </div>
  );
};

const LongTaskChoiceItem: React.FC<{ activity: ToolActivity; onSubmit?: (choiceId: string, answers: Record<string, string[]>) => void }> = ({ activity, onSubmit }) => {
  const request = activity.choiceRequest;
  if (!request || !isLongTaskChoiceRequest(request)) return null;

  const submitted = Boolean(activity.choiceAnswers?.[LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID]?.includes(LONG_TASK_BACKGROUND_CHOICE_VALUE));
  const question = request.questions.find((item) => item.id === LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID);
  if (!question) return null;

  return (
    <div className="mx-2 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
      <div className="text-xs font-medium text-foreground">{request.prompt || `${getToolDisplayName(activity)} 正在执行中`}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{question.description || '如果你不想继续等待，可以切到后台执行。'}</div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-7 items-center rounded-md border border-border/60 bg-background px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
          onClick={() =>
            onSubmit?.(request.choiceId, {
              [LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID]: [LONG_TASK_BACKGROUND_CHOICE_VALUE]
            })
          }
          disabled={submitted}
        >
          {submitted ? '正在切到后台...' : '转为后台执行'}
        </button>
        <span className="text-[11px] text-muted-foreground">{submitted ? '当前等待即将结束，任务会继续在后台运行。' : '继续等待时，进度和状态文本会实时更新。'}</span>
      </div>
    </div>
  );
};

const ToolCallItem: React.FC<{ activity: ToolActivity; onUserChoiceSubmit?: (choiceId: string, answers: Record<string, string[]>) => void }> = ({ activity, onUserChoiceSubmit }) => {
  const [expanded, setExpanded] = useState(false);

  if (CARD_TOOL_NAMES.has(activity.name)) return <CardToolItem activity={activity} />;
  if (ASK_USER_TOOL_NAMES.has(activity.name)) return <AskUserToolItem activity={activity} onSubmit={onUserChoiceSubmit} />;
  if (EMOJI_SEND_TOOL_NAMES.has(activity.name)) return <EmojiSendToolItem activity={activity} />;

  const displayName = getToolDisplayName(activity);
  const isBackgroundExecution = activity.status === 'done' && isBackgroundExecutionResult(activity.result);
  const hasProgress = activity.status === 'calling' && typeof activity.progress === 'number' && activity.progress > 0;
  const showLongTaskChoice = activity.status === 'calling' && isLongTaskChoiceRequest(activity.choiceRequest);

  let statusText = `${displayName} 完成`;
  if (activity.status === 'calling') {
    if (hasProgress) {
      statusText = `${displayName} ${Math.round(activity.progress!)}%${activity.progressMessage ? ` - ${activity.progressMessage}` : ''}`;
    } else if (activity.progressMessage) {
      statusText = `${displayName} - ${activity.progressMessage}`;
    } else {
      statusText = `${displayName} ...`;
    }
  } else if (isBackgroundExecution) {
    statusText = `${displayName} 后台执行中`;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 text-xs">
      <button className="flex items-center gap-1.5 px-2 py-1 text-left transition-colors hover:bg-muted/50" onClick={() => setExpanded(!expanded)}>
        {activity.status === 'calling' ? (
          hasProgress ? (
            <CircularProgress size={12} progress={activity.progress!} />
          ) : (
            <TbLoader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" />
          )
        ) : isBackgroundExecution ? (
          <TbClock className="h-3 w-3 shrink-0 text-amber-500" />
        ) : (
          <TbCheck className="h-3 w-3 shrink-0 text-green-500" />
        )}
        <TbTool className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-muted-foreground max-w-52">{statusText}</span>
        {expanded ? <TbChevronDown className="h-3 w-3" /> : <TbChevronRight className="h-3 w-3" />}
      </button>

      {showLongTaskChoice && <LongTaskChoiceItem activity={activity} onSubmit={onUserChoiceSubmit} />}

      {expanded && (
        <div className="max-h-64 space-y-1 overflow-auto border-t border-border/50 bg-muted/30 px-2 py-1">
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
    <svg width={size} height={size} className="-rotate-90 shrink-0" viewBox={`0 0 ${size} ${size}`}>
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
  const [copied, setCopied] = useState(false);
  const { text, lang } = formatValue(value);
  const canCopy =
    typeof document !== 'undefined' &&
    ((typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText)) || typeof (document as Document & { execCommand?: unknown }).execCommand === 'function');

  const handleCopy = async (): Promise<void> => {
    if (!canCopy) return;
    try {
      const copiedText = await copyValueToClipboard(stringifyValue(value));
      if (!copiedText) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleCopy}
          disabled={!canCopy}
          title={canCopy ? (copied ? `${label}已复制` : `复制${label}`) : '当前环境不支持复制'}
          aria-label={copied ? `${label}已复制` : `复制${label}`}
        >
          {copied ? <TbCheck className="h-3 w-3 text-green-500" /> : <TbCopy className="h-3 w-3" />}
        </button>
      </div>
      {lang !== undefined ? (
        <pre className="overflow-x-auto rounded border border-border/30 bg-background/60 p-1.5 text-[11px] whitespace-pre-wrap break-all text-foreground/90">
          <code>{text}</code>
        </pre>
      ) : (
        <pre className="text-[10px] whitespace-pre-wrap break-all text-foreground/80">{text}</pre>
      )}
    </div>
  );
};

export default ToolCallActivity;
