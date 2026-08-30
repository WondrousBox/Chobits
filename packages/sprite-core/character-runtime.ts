import { getCharacterDefinition, reloadCharacter } from './character-service';

/**
 * Character persona runtime sync。
 *
 * mini 分支已移除 persona 养成规则引擎（xpSources / favorModifiers / moodRules /
 * conversation bonus matchers），这里只保留角色定义的重载入口，
 * 供 IPC 链路在切换/重载角色包时刷新 CharacterService 缓存。
 */
export interface CharacterPersonaRuntimeSyncResult {
  characterId: string | null;
}

export function syncCharacterPersonaRuntime(character = getCharacterDefinition()): CharacterPersonaRuntimeSyncResult {
  return {
    characterId: character?.id ?? null
  };
}

export function reloadCharacterPersonaRuntime(): CharacterPersonaRuntimeSyncResult {
  const character = reloadCharacter();
  return syncCharacterPersonaRuntime(character);
}
