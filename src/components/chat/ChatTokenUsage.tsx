import type { TokenUsage } from '@packages/ai/types';

import { cn } from '@/lib/utils';

interface ChatTokenUsageProps {
  usage?: TokenUsage;
  label?: string;
  className?: string;
  variant?: 'message' | 'conversation';
}

function formatTokenCount(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }

  return new Intl.NumberFormat().format(Math.round(value));
}

export default function ChatTokenUsage({ usage, label, className, variant = 'message' }: ChatTokenUsageProps): JSX.Element | null {
  if (!usage) return null;

  const hasTokenComponent =
    usage.inputTokens !== undefined || usage.outputTokens !== undefined || usage.cacheReadTokens !== undefined || usage.cacheWriteTokens !== undefined || usage.reasoningTokens !== undefined;
  const totalTokens =
    usage.totalTokens ??
    (hasTokenComponent ? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) + (usage.reasoningTokens ?? 0) : undefined);

  if (usage.inputTokens === undefined && usage.outputTokens === undefined && totalTokens === undefined) {
    return null;
  }

  return (
    <div
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none text-muted-foreground',
        variant === 'conversation' ? 'border-border/60 bg-background/80' : 'border-border/40 bg-muted/60',
        className
      )}
    >
      {label ? <span className="font-medium text-foreground/80">{label}</span> : null}
      <span>输入 {formatTokenCount(usage.inputTokens)}</span>
      <span className="text-muted-foreground/50">·</span>
      <span>输出 {formatTokenCount(usage.outputTokens)}</span>
      {totalTokens !== undefined ? (
        <>
          <span className="text-muted-foreground/50">·</span>
          <span>总计 {formatTokenCount(totalTokens)}</span>
        </>
      ) : null}
    </div>
  );
}
