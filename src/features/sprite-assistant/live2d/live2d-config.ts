export interface Live2DTriggerMapping {
  motion?: {
    group: string;
    index: number;
  };
  expression?: string;
  loop?: boolean;
  tapArea?: string;
}

export interface Live2DConfig {
  model?: string;
  canvas: {
    width: number;
    height: number;
    padding: number;
    scale: number;
  };
  lookAt?: {
    enabled: boolean;
    pointer: boolean;
  };
  lipSync?: {
    paramId: string;
    gain: number;
  };
  triggers: Record<string, Live2DTriggerMapping>;
}

const DEFAULT_CANVAS = { width: 300, height: 400, padding: 40, scale: 1 };

function finiteNumber(value: unknown, fallback: number, minimum = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum ? value : fallback;
}

function normalizeTriggerMapping(value: unknown): Live2DTriggerMapping | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rawMotion = raw.motion && typeof raw.motion === 'object' && !Array.isArray(raw.motion) ? (raw.motion as Record<string, unknown>) : null;
  const motion =
    rawMotion && typeof rawMotion.group === 'string' && typeof rawMotion.index === 'number' && Number.isInteger(rawMotion.index) && rawMotion.index >= 0
      ? { group: rawMotion.group, index: rawMotion.index }
      : undefined;
  const expression = typeof raw.expression === 'string' && raw.expression.trim() ? raw.expression.trim() : undefined;
  const loop = typeof raw.loop === 'boolean' ? raw.loop : undefined;
  const tapArea = typeof raw.tapArea === 'string' && raw.tapArea.trim() ? raw.tapArea.trim() : undefined;
  const mapping: Live2DTriggerMapping = {
    ...(motion ? { motion } : {}),
    ...(expression ? { expression } : {}),
    ...(loop !== undefined ? { loop } : {}),
    ...(tapArea ? { tapArea } : {})
  };
  return Object.keys(mapping).length > 0 ? mapping : null;
}

export function normalizeLive2DConfig(value: unknown): Live2DConfig {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const canvas = raw.canvas && typeof raw.canvas === 'object' ? (raw.canvas as Record<string, unknown>) : {};
  const lookAt = raw.lookAt && typeof raw.lookAt === 'object' ? (raw.lookAt as Record<string, unknown>) : null;
  const lipSync = raw.lipSync && typeof raw.lipSync === 'object' ? (raw.lipSync as Record<string, unknown>) : null;
  const rawTriggers = raw.triggers && typeof raw.triggers === 'object' && !Array.isArray(raw.triggers) ? (raw.triggers as Record<string, unknown>) : {};
  const triggers = Object.fromEntries(
    Object.entries(rawTriggers)
      .map(([trigger, mapping]) => [trigger.trim(), normalizeTriggerMapping(mapping)] as const)
      .filter((entry): entry is readonly [string, Live2DTriggerMapping] => !!entry[0] && !!entry[1])
  );

  return {
    ...(typeof raw.model === 'string' && raw.model.trim() ? { model: raw.model } : {}),
    canvas: {
      width: finiteNumber(canvas.width, DEFAULT_CANVAS.width, 1),
      height: finiteNumber(canvas.height, DEFAULT_CANVAS.height, 1),
      padding: finiteNumber(canvas.padding, DEFAULT_CANVAS.padding),
      scale: finiteNumber(canvas.scale, DEFAULT_CANVAS.scale, 0.01)
    },
    ...(lookAt
      ? {
          lookAt: {
            enabled: lookAt.enabled !== false,
            pointer: lookAt.pointer !== false
          }
        }
      : {}),
    ...(lipSync && typeof lipSync.paramId === 'string' && lipSync.paramId.trim()
      ? {
          lipSync: {
            paramId: lipSync.paramId,
            gain: finiteNumber(lipSync.gain, 2)
          }
        }
      : {}),
    triggers
  };
}

export async function loadLive2DConfig(configUrl?: string): Promise<Live2DConfig> {
  if (!configUrl) return normalizeLive2DConfig(null);

  try {
    const response = await fetch(configUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return normalizeLive2DConfig(await response.json());
  } catch (error) {
    console.warn('[Live2DConfig] Failed to load config, using defaults', configUrl, error);
    return normalizeLive2DConfig(null);
  }
}

export function resolveTriggerMapping(config: Live2DConfig | null, trigger: string): Live2DTriggerMapping | null {
  if (!config) return null;
  return config.triggers[trigger] ?? config.triggers.idle ?? null;
}
