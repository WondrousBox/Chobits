import { getCharacterDefinition, reloadCharacter } from './character-service';

/**
 * Character runtime sync。
 *
 * mini 分支已移除 persona 养成规则引擎（xpSources / favorModifiers / moodRules /
 * conversation bonus matchers），这里只保留角色定义的重载入口，
 * 供 IPC 链路在切换/重载角色包时刷新 CharacterService 缓存。
 */
export interface CharacterRuntimeSyncResult {
  characterId: string | null;
}

export function syncCharacterRuntime(character = getCharacterDefinition()): CharacterRuntimeSyncResult {
  return {
    characterId: character?.id ?? null
  };
}

export function reloadCharacterRuntime(): CharacterRuntimeSyncResult {
  const character = reloadCharacter();
  return syncCharacterRuntime(character);
}
