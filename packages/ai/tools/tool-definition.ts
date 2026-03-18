import { z, type ZodTypeAny } from 'zod';

export interface LegacyToolExecutionArgs<TContext> {
  context: TContext;
}

export interface LegacyToolDefinition<TSchema extends ZodTypeAny = ZodTypeAny, TResult = any> {
  id: string;
  description: string;
  inputSchema: TSchema;
  outputSchema?: ZodTypeAny;
  execute: (args: LegacyToolExecutionArgs<z.infer<TSchema>>) => Promise<TResult> | TResult;
}

export function createTool<TSchema extends ZodTypeAny, TResult = any>(definition: LegacyToolDefinition<TSchema, TResult>): LegacyToolDefinition<TSchema, TResult> {
  return definition;
}
