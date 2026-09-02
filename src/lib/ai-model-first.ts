export interface ResolveModelFirstParams {
  providerId?: string;
  modelId?: string;
  preferredPresetId?: string;
}

export interface ResolvedModelFirstSelection {
  providerId: string;
  modelId: string;
  providerPresetId: string;
}

export async function resolveModelFirstSelection(params: ResolveModelFirstParams): Promise<ResolvedModelFirstSelection | null> {
  const providerId = params.providerId?.trim();
  const modelId = params.modelId?.trim();

  if (!providerId || !modelId) {
    return null;
  }

  const preset = await window.chobits.ai.resolveUsablePreset(providerId, params.preferredPresetId);
  if (!preset?.id) {
    return null;
  }

  return {
    providerId,
    modelId,
    providerPresetId: preset.id
  };
}
