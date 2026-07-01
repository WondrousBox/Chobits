import { MINIMAX_SYSTEM_VOICE_GROUPS } from './builtins/minimax/system-voices';

export interface ProviderVoiceOption {
  id: string;
  label: string;
  language?: string;
  keywords?: string[];
}

export interface ProviderVoiceGroup {
  id: string;
  label: string;
  voices: ProviderVoiceOption[];
}

export interface ProviderVoiceCatalog {
  providerId: string;
  label: string;
  groups: ProviderVoiceGroup[];
}

const minimaxVoiceCatalog: ProviderVoiceCatalog = {
  providerId: 'minimax',
  label: 'MiniMax',
  groups: MINIMAX_SYSTEM_VOICE_GROUPS.map((group) => ({
    id: group.lang,
    label: group.lang,
    voices: group.voices.map((voice) => ({
      id: voice.value,
      label: voice.label,
      language: voice.lang,
      keywords: [voice.value, voice.label, voice.lang]
    }))
  }))
};

const PROVIDER_VOICE_CATALOGS: Record<string, ProviderVoiceCatalog> = {
  minimax: minimaxVoiceCatalog,
  minimaxi: minimaxVoiceCatalog
};

export function getProviderVoiceCatalog(providerId?: string): ProviderVoiceCatalog | undefined {
  const key = String(providerId || '')
    .trim()
    .toLowerCase();
  return key ? PROVIDER_VOICE_CATALOGS[key] : undefined;
}
