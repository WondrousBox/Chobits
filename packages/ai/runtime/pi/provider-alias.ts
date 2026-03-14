const PROVIDER_ALIASES: Record<string, string[]> = {
  anthropic: ['anthropic'],
  deepseek: ['deepseek'],
  gemini: ['gemini', 'google'],
  ollama: ['ollama'],
  openai: ['openai'],
  qwen: ['qwen'],
  zhipu: ['zhipu', 'zhipuai']
};

const ALIAS_TO_CANONICAL = new Map<string, string>();

for (const [canonicalId, aliases] of Object.entries(PROVIDER_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(alias, canonicalId);
  }
}

export function toCanonicalProviderId(providerId?: string): string {
  const normalized = (providerId || '').trim().toLowerCase();
  if (!normalized) return 'openai';
  return ALIAS_TO_CANONICAL.get(normalized) || normalized;
}

export function getProviderAliases(canonicalProviderId: string): string[] {
  const canonicalId = toCanonicalProviderId(canonicalProviderId);
  return PROVIDER_ALIASES[canonicalId] || [canonicalId];
}

export function isSameProviderId(left?: string, right?: string): boolean {
  return toCanonicalProviderId(left) === toCanonicalProviderId(right);
}

export function resolveKnownProviderId(providerId: string, knownProviderIds: string[]): string {
  const canonicalId = toCanonicalProviderId(providerId);
  const exact = knownProviderIds.find((id) => id === providerId);
  if (exact) return exact;

  const matched = knownProviderIds.find((id) => isSameProviderId(id, canonicalId));
  return matched || canonicalId;
}
