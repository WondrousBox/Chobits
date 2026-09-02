import { randomUUID } from 'node:crypto';

import type { UserChoiceRequest } from '../../../types';
import type { PiSessionToolContext } from '../tool-context';
import { getPiToolDescriptor, resolvePiToolId } from '../tool-registry';
import { getSkillSourceInfo } from './source-info';
import { getSkillSourcePolicy } from './source-policy';
import type { SkillRecord, SkillSourcePolicy } from './types';

type GuardedSkillCandidate = {
  record: SkillRecord;
  sourceInfo: ReturnType<typeof getSkillSourceInfo>;
  sourcePolicy: SkillSourcePolicy;
};

export type GuardedToolExecutionResolution =
  | {
      kind: 'allow';
      guardedSkills: GuardedSkillCandidate[];
      warning?: string;
    }
  | {
      details: Record<string, unknown>;
      kind: 'cancel';
    }
  | {
      details: Record<string, unknown>;
      kind: 'blocked';
    };

export async function resolveGuardedToolExecution(toolContext: PiSessionToolContext, toolCallId: string, toolNameOrId: string): Promise<GuardedToolExecutionResolution | undefined> {
  const guardedSkills = collectPendingGuardedSkillsForTool(toolContext, toolNameOrId);
  if (!guardedSkills.length) {
    return undefined;
  }

  const toolId = resolvePiToolId(toolNameOrId) || toolNameOrId;
  const toolLabel = getPiToolDescriptor(toolId)?.name || toolNameOrId;

  const decision = await promptForGuardedToolExecution(toolContext, toolCallId, guardedSkills, toolLabel);
  if (decision === 'continue') {
    for (const guardedSkill of guardedSkills) {
      toolContext.skillSessionState?.approvedGuardedSkillNames.add(guardedSkill.record.name);
    }

    return {
      kind: 'allow',
      guardedSkills,
      warning: `User explicitly confirmed guarded tool execution for ${guardedSkills.map((skill) => skill.record.name).join(', ')}.`
    };
  }

  if (decision === 'cancel') {
    return {
      kind: 'cancel',
      details: {
        success: false,
        cancelled: true,
        error: `User declined to continue with guarded tool execution for ${guardedSkills.map((skill) => `"${skill.record.name}"`).join(', ')}.`,
        guardedSkills: guardedSkills.map((skill) => formatGuardedSkillDetail(skill)),
        requiresConfirmation: true,
        tool: toolLabel
      }
    };
  }

  return {
    kind: 'blocked',
    details: {
      success: false,
      error: `Tool "${toolLabel}" requires explicit confirmation because guarded skills are currently active in this session.`,
      guardedSkills: guardedSkills.map((skill) => formatGuardedSkillDetail(skill)),
      nextStep: 'Use ask-user capable runtime confirmation or explicitly re-run after reviewing the guarded skill.',
      requiresConfirmation: true,
      tool: toolLabel
    }
  };
}

function collectPendingGuardedSkillsForTool(toolContext: PiSessionToolContext, toolNameOrId: string): GuardedSkillCandidate[] {
  const toolId = resolvePiToolId(toolNameOrId) || toolNameOrId;
  const registry = toolContext.skillRegistry;
  const state = toolContext.skillSessionState;

  if (!registry || !state) {
    return [];
  }

  const guardedSkills: GuardedSkillCandidate[] = [];
  for (const skillName of state.activeSkillNames) {
    if (state.approvedGuardedSkillNames.has(skillName)) {
      continue;
    }

    const record = registry.get(skillName);
    if (!record) {
      continue;
    }

    const sourcePolicy = getSkillSourcePolicy(record);
    if (sourcePolicy.riskLevel !== 'guarded') {
      continue;
    }

    if (!sourcePolicy.sensitiveToolIds.includes(toolId)) {
      continue;
    }

    guardedSkills.push({
      record,
      sourceInfo: getSkillSourceInfo(record),
      sourcePolicy
    });
  }

  return guardedSkills;
}

async function promptForGuardedToolExecution(
  toolContext: PiSessionToolContext,
  toolCallId: string,
  guardedSkills: GuardedSkillCandidate[],
  toolLabel: string
): Promise<'cancel' | 'continue' | undefined> {
  const { emitUserChoiceRequest, waitForUserChoiceResponse } = toolContext;
  if (!emitUserChoiceRequest || !waitForUserChoiceResponse) {
    return undefined;
  }

  const choiceId = randomUUID();
  const request: UserChoiceRequest = {
    choiceId,
    toolCallId,
    prompt: `当前工具 ${toolLabel} 将由高风险来源的 skill 驱动执行，请确认是否继续。`,
    questions: [
      {
        id: 'guarded_tool_execution',
        title: `是否继续执行 ${toolLabel}？`,
        description: guardedSkills.map((skill) => `${skill.record.name} (${skill.sourceInfo.label}): ${skill.sourcePolicy.message}`).join(' '),
        multiple: false,
        options: [
          {
            value: 'continue',
            label: '继续执行',
            description: '确认当前工具执行。'
          },
          {
            value: 'cancel',
            label: '取消',
            description: '先停止这次工具执行。'
          }
        ]
      }
    ]
  };

  emitUserChoiceRequest(request);
  const response = await waitForUserChoiceResponse(choiceId);
  const answer = response.answers['guarded_tool_execution']?.[0];
  if (answer === 'continue' || answer === 'cancel') {
    return answer;
  }
  return 'cancel';
}

function formatGuardedSkillDetail(skill: GuardedSkillCandidate) {
  return {
    name: skill.record.name,
    source: skill.record.source,
    sourceLabel: skill.sourceInfo.label,
    sourcePolicy: skill.sourcePolicy,
    trustLevel: skill.sourceInfo.trustLevel
  };
}
