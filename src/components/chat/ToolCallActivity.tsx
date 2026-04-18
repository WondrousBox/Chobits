/**
 * 工具调用活动指示器
 * 在 AI 回复时展示工具调用状态（调用中 / 已完成），支持折叠查看参数和结果。
 * pushCardTool 的调用会直接渲染为资源卡片。
 */

import {
  LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID,
  LONG_TASK_BACKGROUND_CHOICE_VALUE,
  type UserChoiceRequest
} from '@packages/ai/types';
import { useState } from 'react';
import { TbCheck, TbChevronDown, TbChevronRight, TbClock, TbLoader2, TbTool } from 'react-icons/tb';

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
  choiceRequest?: UserChoiceRequest;
  choiceAnswers?: Record<string, string[]>;
}

interface ToolCallActivityProps {
  activities: ToolActivity[];
  onUserChoiceSubmit?: (choiceId: string, answers: Record<string, string[]>) => void;
}

const CARD_TOOL_NAMES = new Set(['pushCardTool', 'push-card']);
const ASK_USER_TOOL_NAMES = new Set(['askUserTool', 'ask-user']);

const ToolCallActivity: React.FC<ToolCallActivityProps> = ({ activities, onUserChoiceSubmit }) => {
  if (activities.length === 0) return null;

  return (
    <div className="mb-1 flex flex-col gap-1">
      {activities.map((activity) => (
        <ToolCallItem key={activity.callId} activity={activity} onUserChoiceSubmit={onUserChoiceSubmit} />
      ))}
    </div>
  );
};

function formatValue(val: any, max = 2000): { text: string; lang?: string } {
  const s = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
  const truncated = s.length > max ? `${s.slice(0, max)}...` : s;
  if (typeof val === 'object' && val !== null) return { text: truncated, lang: 'json' };
  if (typeof val === 'string' && /^[\[{]/.test(val.trim())) return { text: truncated, lang: 'json' };
  if (typeof val === 'string' && /(function |=>|import |const |let |var |class |def |#include)/.test(val)) return { text: truncated, lang: '' };
  return { text: truncated };
}

function getToolDisplayName(activity: ToolActivity): string {
  if (activity.label) return activity.label;
  return activity.name;
}

function isLongTaskChoiceRequest(request?: UserChoiceRequest): boolean {
  if (!request) return false;
  return request.questions.some(
    (question) =>
      question.id === LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID &&
      question.options.some((option) => option.value === LONG_TASK_BACKGROUND_CHOICE_VALUE)
  );
}

function isBackgroundExecutionResult(result: any): boolean {
  return result?.executionMode === 'background' || result?.backgrounded === true;
}

const CardToolItem: React.FC<{ activity: ToolActivity }> = ({ activity }) => {
  const args = typeof activity.args === 'string' ? JSON.parse(activity.args) : activity.args;
  if (!args) return null;

  return (
    <div className="py-0.5">
      {args.text && <div className="mb-1 text-xs text-muted-foreground">{args.text}</div>}
      <ResourceCard resourceId={args.resourceId} data={args.data} cardType={args.type} compact />
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
  if (CARD_TOOL_NAMES.has(activity.name)) return <CardToolItem activity={activity} />;
  if (ASK_USER_TOOL_NAMES.has(activity.name)) return <AskUserToolItem activity={activity} onSubmit={onUserChoiceSubmit} />;

  const [expanded, setExpanded] = useState(false);
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
        <span className="truncate text-muted-foreground">{statusText}</span>
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
  const { text, lang } = formatValue(value);
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">{label}</div>
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
