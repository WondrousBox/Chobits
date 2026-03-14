export type ProviderIdentityRow = {
  id: string;
  aliases?: string[];
};

function normalizeProviderId(providerId?: string): string {
  return (providerId || '').trim().toLowerCase();
}

export function matchesProviderIdentity(provider: ProviderIdentityRow | null | undefined, providerId?: string): boolean {
  const normalizedProviderId = normalizeProviderId(providerId);
  if (!provider || !normalizedProviderId) return false;

  const knownIds = [provider.id, ...(provider.aliases || [])].map((id) => normalizeProviderId(id));
  return knownIds.includes(normalizedProviderId);
}

export function resolveProviderIdentity<T extends ProviderIdentityRow>(providers: T[], providerId?: string): T | undefined {
  return providers.find((provider) => matchesProviderIdentity(provider, providerId));
}
