import type { ExplicitSkillInvocationInput } from '@packages/ai/types';

const EXPLICIT_SKILL_AGENT_ID = 'assistant';
const COMMAND_STYLE_REFERENCE_RE = /^[a-z0-9][a-z0-9._-]*$/i;

export function buildExplicitSkillInvocationInput(agentId: string | undefined, content: string): ExplicitSkillInvocationInput | undefined {
  if (agentId !== EXPLICIT_SKILL_AGENT_ID) {
    return undefined;
  }

  const trimmedContent = content.trim();
  if (!trimmedContent.startsWith('/')) {
    return undefined;
  }

  const commandBody = trimmedContent.slice(1).trim();
  if (!commandBody) {
    return undefined;
  }

  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(commandBody);
  if (!match) {
    return undefined;
  }

  const matchedReference = match[1].trim();
  if (!matchedReference || !COMMAND_STYLE_REFERENCE_RE.test(matchedReference)) {
    return undefined;
  }

  const remainingQuery = match[2]?.trim() || undefined;
  return {
    matchedReference,
    ...(remainingQuery ? { remainingQuery } : {}),
    source: 'slash-command'
  };
}
