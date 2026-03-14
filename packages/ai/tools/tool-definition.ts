import type { ZodTypeAny } from 'zod';

export interface LegacyToolExecutionArgs<TContext> {
  context: TContext;
}

export interface LegacyToolDefinition<TContext = any, TResult = any> {
  id: string;
  description: string;
  inputSchema: ZodTypeAny;
  outputSchema?: ZodTypeAny;
  execute: (args: LegacyToolExecutionArgs<TContext>) => Promise<TResult> | TResult;
}

export function createTool<TContext = any, TResult = any>(definition: LegacyToolDefinition<TContext, TResult>): LegacyToolDefinition<TContext, TResult> {
  return definition;
}
