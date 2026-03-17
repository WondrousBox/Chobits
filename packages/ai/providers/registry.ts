import type { ProviderDefinition } from './types';

const definitions = new Map<string, ProviderDefinition>();
const aliasToCanonical = new Map<string, string>();

function normalizeProviderId(providerId?: string): string {
  return String(providerId || '').trim().toLowerCase();
}

function normalizeAliases(providerId: string, aliases?: string[]): string[] {
  return Array.from(
    new Set(
      [providerId, ...(aliases || [])]
        .map((alias) => normalizeProviderId(alias))
        .filter(Boolean)
    )
  );
}

function validateDefinition(definition: ProviderDefinition): { aliases: string[]; id: string } {
  const id = normalizeProviderId(definition.id);
  if (!id) {
    throw new Error('Provider definition id is required');
  }

  if (!definition.display?.label) {
    throw new Error(`Provider definition ${id} is missing display.label`);
  }

  const aliases = normalizeAliases(id, definition.aliases);
  return { aliases, id };
}

export function registerProviderDefinition(definition: ProviderDefinition): ProviderDefinition {
  const { aliases, id } = validateDefinition(definition);

  for (const alias of aliases) {
    const existing = aliasToCanonical.get(alias);
    if (existing && existing !== id) {
      throw new Error(`Provider alias conflict: ${alias} is already registered for ${existing}`);
    }
  }

  const normalizedDefinition: ProviderDefinition = {
    ...definition,
    id,
    aliases
  };

  definitions.set(id, normalizedDefinition);

  for (const alias of aliases) {
    aliasToCanonical.set(alias, id);
  }

  return normalizedDefinition;
}

export function resolveProviderDefinitionId(providerId?: string): string | undefined {
  const normalized = normalizeProviderId(providerId);
  if (!normalized) return undefined;
  return aliasToCanonical.get(normalized) || normalized;
}

export function getRegisteredProviderDefinition(providerId?: string): ProviderDefinition | undefined {
  const resolvedId = resolveProviderDefinitionId(providerId);
  if (!resolvedId) return undefined;
  return definitions.get(resolvedId);
}

export function listRegisteredProviderDefinitions(): ProviderDefinition[] {
  return Array.from(definitions.values());
}

export function getRegisteredProviderAliases(providerId?: string): string[] {
  const definition = getRegisteredProviderDefinition(providerId);
  return definition?.aliases ? [...definition.aliases] : [];
}
