type ProviderRow = {
  id: string;
  defaultModel?: string;
  defaultModels?: {
    chat?: string;
  };
};

type ModelRow = {
  id: string;
  type?: string;
};

const CHAT_SELECTION_KEYS = {
  providerId: 'chat.sel.providerId',
  modelId: 'chat.sel.modelId',
  presetId: 'chat.sel.presetId'
};

function isChatModel(model: ModelRow): boolean {
  const type = String(model.type || '').toLowerCase();
  return !type || type === 'chat' || type === 'vision' || type === 'realtime' || type === 'tool' || type === 'tooling';
}

function resolveChatModelId(provider: ProviderRow | undefined, models: ModelRow[]): string {
  const defaultModelId = provider?.defaultModels?.chat || provider?.defaultModel;
  return models.find(isChatModel)?.id || defaultModelId || '';
}

function writeSelection(providerId: string, presetId: string | undefined, modelId: string): void {
  localStorage.setItem(CHAT_SELECTION_KEYS.providerId, providerId);
  if (presetId) {
    localStorage.setItem(CHAT_SELECTION_KEYS.presetId, presetId);
  } else {
    localStorage.removeItem(CHAT_SELECTION_KEYS.presetId);
  }

  if (modelId) {
    localStorage.setItem(CHAT_SELECTION_KEYS.modelId, modelId);
  } else {
    localStorage.removeItem(CHAT_SELECTION_KEYS.modelId);
  }
}

export async function selectChatDefaultsForProvider(input: { providerId: string; presetId?: string; provider?: ProviderRow }): Promise<{ providerId: string; presetId?: string; modelId: string }> {
  const providerId = input.providerId.trim();
  const presetId = input.presetId?.trim() || undefined;
  if (!providerId) {
    return { providerId, presetId, modelId: '' };
  }

  const provider =
    input.provider ??
    ((await window.chobits.ai
      .getProviders()
      .then((providers) => providers.find((item: ProviderRow) => item.id === providerId))
      .catch(() => undefined)) as ProviderRow | undefined);
  const models = ((await window.chobits.ai.listModels(providerId, presetId).catch(() => [])) || []) as ModelRow[];
  const modelId = resolveChatModelId(provider, models);
  writeSelection(providerId, presetId, modelId);
  return { providerId, presetId, modelId };
}
