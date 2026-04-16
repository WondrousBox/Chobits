import type { SkillInfo } from '@packages/ai/types';

const SKILL_PICKER_AGENT_ID = 'assistant';

export function shouldEnableSkillPicker(agentId: string | undefined): boolean {
  return agentId === SKILL_PICKER_AGENT_ID;
}

export function isTypingSlashSkillQuery(content: string): boolean {
  return /^\/\S*$/.test(content.trim());
}

export function deriveSkillPickerQuery(content: string): string {
  const trimmedContent = content.trim();
  if (!trimmedContent.startsWith('/')) {
    return '';
  }

  const commandBody = trimmedContent.slice(1).trim();
  const match = /^(\S+)/.exec(commandBody);
  return match?.[1] || '';
}

export function extractSkillCommandArgs(content: string): string | undefined {
  const trimmedContent = content.trim();
  if (!trimmedContent.startsWith('/')) {
    return undefined;
  }

  const commandBody = trimmedContent.slice(1).trim();
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(commandBody);
  return match?.[2]?.trim() || undefined;
}

export function applySkillPickerSelection(content: string, skillName: string): string {
  const trimmedContent = content.trim();
  if (!trimmedContent.startsWith('/')) {
    return `/${skillName} `;
  }

  const commandBody = trimmedContent.slice(1).trim();
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(commandBody);
  const remainingQuery = match?.[2]?.trim();
  return remainingQuery ? `/${skillName} ${remainingQuery}` : `/${skillName} `;
}

export function resolveActiveSkillInfo(content: string, skills: SkillInfo[]): SkillInfo | undefined {
  const trimmedContent = content.trim();
  if (!trimmedContent.startsWith('/')) {
    return undefined;
  }

  const commandBody = trimmedContent.slice(1).trim();
  const match = /^(\S+)/.exec(commandBody);
  const reference = match?.[1]?.trim().toLowerCase();
  if (!reference) {
    return undefined;
  }

  return skills.find((skill) => {
    const references = [skill.name, ...skill.aliases].map((item) => item.trim().toLowerCase()).filter(Boolean);
    return references.includes(reference);
  });
}

export function resolveSuggestedSkillInfo(content: string, skills: SkillInfo[]): SkillInfo | undefined {
  return listSkillSuggestions(content, skills)[0];
}

export function listSkillSuggestions(content: string, skills: SkillInfo[]): SkillInfo[] {
  const query = deriveSkillPickerQuery(content).trim().toLowerCase();
  if (!query) {
    return [];
  }

  const matches = new Map<string, { score: number; skill: SkillInfo }>();

  for (const skill of skills) {
    const references = [skill.name, ...skill.aliases].map((item) => item.trim()).filter(Boolean);

    for (const reference of references) {
      const normalizedReference = reference.toLowerCase();
      let score = -1;

      if (normalizedReference === query) {
        score = 1000 + normalizedReference.length;
      } else if (normalizedReference.startsWith(query)) {
        score = 500 + normalizedReference.length;
      } else if (normalizedReference.includes(query)) {
        score = 100 + normalizedReference.length;
      }

      if (score < 0) {
        continue;
      }

      const current = matches.get(skill.name);
      if (!current || score > current.score) {
        matches.set(skill.name, {
          score,
          skill
        });
      }
    }
  }

  return Array.from(matches.values())
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name, 'zh-Hans-CN'))
    .map((item) => item.skill);
}
