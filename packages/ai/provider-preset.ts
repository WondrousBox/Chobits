export interface ProviderPresetReference {
  providerPresetId?: string;
}

export function resolveProviderPresetId(reference?: ProviderPresetReference | null): string | undefined {
  const presetId = reference?.providerPresetId?.trim();
  return presetId || undefined;
}

export function normalizeProviderPreset<T extends ProviderPresetReference>(reference: T): T & ProviderPresetReference {
  return {
    ...reference,
    providerPresetId: resolveProviderPresetId(reference)
  };
}
