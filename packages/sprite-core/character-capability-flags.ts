import { type CharacterDefinition, type CharacterPackDefinition, getCharacterDefinition, getCharacterPackDefinition } from './character-service';

export interface CharacterCapabilityContextFlags {
  characterId: string | null;
  featureFlags: Record<string, boolean>;
}

function normalizeFlagId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toTrueRecord(values: Iterable<string>): Record<string, boolean> {
  const record: Record<string, boolean> = {};
  for (const value of values) {
    record[value] = true;
  }
  return record;
}

function collectPackFeatureFlags(pack: CharacterPackDefinition | null | undefined): Set<string> {
  const featureFlags = new Set<string>();
  if (!pack) {
    return featureFlags;
  }

  featureFlags.add('pack:loaded');

  const packId = normalizeFlagId(pack.id);
  if (packId) {
    featureFlags.add(`pack:id:${packId}`);
  }

  const capabilities = pack.capabilities;
  if (capabilities?.hasVoice) {
    featureFlags.add('pack:has-voice');
  }
  if (capabilities?.hasCustomAnimations) {
    featureFlags.add('pack:has-custom-animations');
    // Keep the current capability definitions compatible while pack lifecycle
    // is still being phased in as the primary source of avatar capabilities.
    featureFlags.add('character:has-custom-appearance');
  }
  if (capabilities?.has3DModel) {
    featureFlags.add('pack:has-3d-model');
  }

  for (const language of capabilities?.supportedLanguages ?? []) {
    const normalized = normalizeFlagId(language);
    if (normalized) {
      featureFlags.add(`pack:language:${normalized}`);
    }
  }

  for (const dimensionId of capabilities?.dimensionExtensions ?? []) {
    const normalized = normalizeFlagId(dimensionId);
    if (normalized) {
      featureFlags.add(`pack:dimension-extension:${normalized}`);
    }
  }

  return featureFlags;
}

function collectFeatureFlags(character: CharacterDefinition | null | undefined, pack: CharacterPackDefinition | null | undefined): Set<string> {
  const featureFlags = new Set<string>();
  for (const packFlag of collectPackFeatureFlags(pack)) {
    featureFlags.add(packFlag);
  }

  if (!character) {
    return featureFlags;
  }

  featureFlags.add('character:loaded');
  const characterId = normalizeFlagId(character.id);
  if (characterId) {
    featureFlags.add(`character:id:${characterId}`);
  }

  for (const entry of character.capabilityFlags?.featureFlags ?? []) {
    const normalized = normalizeFlagId(entry);
    if (normalized) {
      featureFlags.add(normalized);
    }
  }

  return featureFlags;
}

export function getCharacterCapabilityContextFlags(character = getCharacterDefinition(), pack = getCharacterPackDefinition()): CharacterCapabilityContextFlags {
  const featureFlags = collectFeatureFlags(character, pack);
  const normalizedCharacterId = character ? normalizeFlagId(character.id) : null;

  return {
    characterId: normalizedCharacterId,
    featureFlags: toTrueRecord(featureFlags)
  };
}
