/**
 * live2d.json 触发映射配置加载器。
 *
 * 每个 Live2D 模型目录下可选放置 live2d.json，描述：
 * - 模型入口文件（model3.json）
 * - 画布尺寸与缩放
 * - 视线追踪 / lip-sync 参数
 * - 语义 trigger 到 motion / expression 的映射
 */

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
  model: string;
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

const DEFAULT_CANVAS = { width: 300, height: 400, padding: 40, scale: 1.0 };

/**
 * 从模型目录 URL 加载 live2d.json。
 * 失败时返回 null（表示该模型没有自定义映射，全部回退 idle）。
 */
export async function loadLive2DConfig(modelDirUrl: string): Promise<Live2DConfig | null> {
  const url = `${modelDirUrl.replace(/\/?$/, '/')}live2d.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Live2DConfig] no live2d.json at ${url} (status ${res.status})`);
      return null;
    }
    const raw = (await res.json()) as Partial<Live2DConfig>;
    return normalizeLive2DConfig(raw);
  } catch (e) {
    console.warn(`[Live2DConfig] failed to load ${url}`, e);
    return null;
  }
}

function normalizeLive2DConfig(raw: Partial<Live2DConfig>): Live2DConfig {
  return {
    model: typeof raw.model === 'string' ? raw.model : '',
    canvas: {
      width: raw.canvas?.width ?? DEFAULT_CANVAS.width,
      height: raw.canvas?.height ?? DEFAULT_CANVAS.height,
      padding: raw.canvas?.padding ?? DEFAULT_CANVAS.padding,
      scale: raw.canvas?.scale ?? DEFAULT_CANVAS.scale
    },
    lookAt: raw.lookAt,
    lipSync: raw.lipSync,
    triggers: raw.triggers ?? {}
  };
}

/**
 * 按 trigger 查找映射；未命中时回退到 idle 映射，再没有则返回 null。
 */
export function resolveTriggerMapping(config: Live2DConfig | null, trigger: string): Live2DTriggerMapping | null {
  if (!config) return null;
  const direct = config.triggers[trigger];
  if (direct) return direct;
  return config.triggers['idle'] ?? null;
}
