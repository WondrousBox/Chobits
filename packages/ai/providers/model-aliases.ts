// 产品命名由 chi 统一为 chii（《Chobits》角色官方罗马字 Chii）后，
// 已持久化的 preset / provider 配置里仍可能存旧模型 id；
// 实际发请求与模型定义查询前统一映射为新 id，旧配置不因此失效
const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'chi-chat': 'chii-chat',
  'chi-translate': 'chii-translate',
  'chi-tts': 'chii-tts'
};

export function resolveModelAlias(model: string): string {
  return LEGACY_MODEL_ALIASES[model] || model;
}
