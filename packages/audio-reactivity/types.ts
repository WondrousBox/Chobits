export type MusicReactivityCaptureSource = 'manual' | 'app-media' | 'system-loopback' | 'microphone-test';
export type MusicReactivityPreferenceSource = 'auto' | MusicReactivityCaptureSource;
export type MusicReactivitySensitivity = 'low' | 'medium' | 'high';
export type MusicReactivityState = 'idle' | 'candidate' | 'dancing' | 'cooldown' | 'unavailable';

export const MUSIC_REACTIVITY_SNAPSHOT_CHANNEL = 'music-reactivity:snapshot';

export interface MusicReactivityPreferences {
  enabled: boolean;
  source: MusicReactivityPreferenceSource;
  sensitivity: MusicReactivitySensitivity;
  danceTrigger: string;
  idleBopTrigger?: string;
  stopTrigger?: string;
  showDebugOverlay: boolean;
}

export interface MusicReactivityThresholds {
  enterProbability: number;
  exitProbability: number;
  enterMs: number;
  exitMs: number;
  minEnergyDb: number;
  cooldownMs: number;
}

export interface MusicReactivityAnalysisInput {
  source?: MusicReactivityCaptureSource;
  timestampMs?: number;
  energy?: number;
  energyDb?: number;
  onsetStrength?: number;
  musicProbability?: number;
  speechProbability?: number;
  beatConfidence?: number;
  bpm?: number;
  beatTick?: boolean;
  reason?: string;
}

export interface MusicReactivitySnapshot {
  running: boolean;
  source: MusicReactivityCaptureSource | 'none';
  timestampMs: number;
  energy: number;
  energyDb: number;
  onsetStrength: number;
  musicProbability: number;
  speechProbability?: number;
  beatConfidence?: number;
  bpm?: number;
  beatTick?: boolean;
  state: MusicReactivityState;
  reason?: string;
}

export const DEFAULT_MUSIC_REACTIVITY_PREFERENCES: MusicReactivityPreferences = {
  enabled: false,
  source: 'auto',
  sensitivity: 'medium',
  danceTrigger: 'music:dance',
  idleBopTrigger: 'music:idle-bop',
  stopTrigger: 'music:stop',
  showDebugOverlay: false
};

export const MUSIC_REACTIVITY_THRESHOLDS: Record<MusicReactivitySensitivity, MusicReactivityThresholds> = {
  low: {
    enterProbability: 0.72,
    exitProbability: 0.45,
    enterMs: 3500,
    exitMs: 5000,
    minEnergyDb: -42,
    cooldownMs: 1800
  },
  medium: {
    enterProbability: 0.62,
    exitProbability: 0.38,
    enterMs: 2500,
    exitMs: 4000,
    minEnergyDb: -45,
    cooldownMs: 1500
  },
  high: {
    enterProbability: 0.52,
    exitProbability: 0.32,
    enterMs: 1800,
    exitMs: 4500,
    minEnergyDb: -48,
    cooldownMs: 1500
  }
};

const PREFERENCE_SOURCES = new Set<MusicReactivityPreferenceSource>(['auto', 'manual', 'app-media', 'system-loopback', 'microphone-test']);
const SENSITIVITIES = new Set<MusicReactivitySensitivity>(['low', 'medium', 'high']);

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeMusicReactivityPreferences(value?: Partial<MusicReactivityPreferences> | null): MusicReactivityPreferences {
  const source =
    typeof value?.source === 'string' && PREFERENCE_SOURCES.has(value.source as MusicReactivityPreferenceSource)
      ? (value.source as MusicReactivityPreferenceSource)
      : DEFAULT_MUSIC_REACTIVITY_PREFERENCES.source;
  const sensitivity =
    typeof value?.sensitivity === 'string' && SENSITIVITIES.has(value.sensitivity as MusicReactivitySensitivity)
      ? (value.sensitivity as MusicReactivitySensitivity)
      : DEFAULT_MUSIC_REACTIVITY_PREFERENCES.sensitivity;

  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_MUSIC_REACTIVITY_PREFERENCES.enabled,
    source,
    sensitivity,
    danceTrigger: readString(value?.danceTrigger) ?? DEFAULT_MUSIC_REACTIVITY_PREFERENCES.danceTrigger,
    idleBopTrigger: readString(value?.idleBopTrigger) ?? DEFAULT_MUSIC_REACTIVITY_PREFERENCES.idleBopTrigger,
    stopTrigger: readString(value?.stopTrigger) ?? DEFAULT_MUSIC_REACTIVITY_PREFERENCES.stopTrigger,
    showDebugOverlay: typeof value?.showDebugOverlay === 'boolean' ? value.showDebugOverlay : DEFAULT_MUSIC_REACTIVITY_PREFERENCES.showDebugOverlay
  };
}
