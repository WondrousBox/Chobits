import path from 'node:path';

import type { SkillRecord, SkillSourceInfo, SkillTrustLevel } from './types';

export function getSkillSourceInfo(record: Pick<SkillRecord, 'source' | 'sourceInfo' | 'sourceRootDir' | 'skillDir'>): SkillSourceInfo {
  if (record.sourceInfo) {
    return record.sourceInfo;
  }

  return buildSkillSourceInfo({
    source: record.source,
    sourceRootDir: record.sourceRootDir,
    skillDir: record.skillDir
  });
}

export function buildSkillSourceInfo(input: { source: SkillRecord['source']; sourceRootDir?: string; skillDir: string }): SkillSourceInfo {
  switch (input.source) {
    case 'bundled':
      return {
        label: 'Bundled',
        trustNote: 'Built-in skill maintained by Chobits. Treat it as trusted, but runtime tool permissions still apply.',
        trustLevel: 'trusted'
      };
    case 'user':
      return {
        detail: trimPath(input.sourceRootDir),
        label: 'User',
        trustNote: 'User-owned skill loaded from local skill directories. Treat it as trusted unless the local environment itself is compromised.',
        trustLevel: 'trusted'
      };
    case 'project':
      return {
        detail: trimPath(input.sourceRootDir),
        label: 'Project',
        trustNote: 'Workspace skill provided by the current repository. Keep its actions scoped to the active workspace and review sensitive steps as needed.',
        trustLevel: 'workspace'
      };
    case 'plugin': {
      const pluginName = resolvePluginSkillContainerName(input.sourceRootDir, input.skillDir);
      return {
        detail: trimPath(input.sourceRootDir) || trimPath(input.skillDir),
        label: pluginName ? `Plugin: ${pluginName}` : 'Plugin',
        trustNote: 'Plugin-provided skill. Verify the plugin source and requested actions before using it on sensitive tasks or repositories.',
        trustLevel: 'plugin'
      };
    }
    case 'synthetic-toolbox':
      return {
        label: 'Toolbox Compat',
        trustNote: 'Compatibility skill synthesized from legacy toolbox content. Prefer native skills when available and treat this as a migration bridge.',
        trustLevel: 'compatibility'
      };
    default:
      return {
        label: 'Unknown',
        trustNote: 'Unknown skill source. Inspect the source before relying on it for sensitive work.',
        trustLevel: 'compatibility'
      };
  }
}

function resolvePluginSkillContainerName(sourceRootDir: string | undefined, skillDir: string): string | undefined {
  const candidates = [sourceRootDir, sourceRootDir ? path.dirname(sourceRootDir) : undefined, path.dirname(path.dirname(skillDir))]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const baseName = path.basename(candidate);
    if (!baseName || baseName === '.' || baseName === 'skills' || baseName === 'pi-skills') {
      continue;
    }
    return baseName;
  }

  return undefined;
}

function trimPath(targetPath?: string): string | undefined {
  const trimmed = targetPath?.trim();
  return trimmed || undefined;
}

export function isTrustedSkillSource(trustLevel: SkillTrustLevel): boolean {
  return trustLevel === 'trusted' || trustLevel === 'workspace';
}

export function requiresSkillSourceCaution(trustLevel: SkillTrustLevel): boolean {
  return trustLevel === 'plugin' || trustLevel === 'compatibility';
}
