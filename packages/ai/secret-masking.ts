// 敏感字段（schema 中 type: 'password'）在交互界面的掩码约定：
// - IPC 下发的内置默认配置（defaultConfig）中，password 字段的值替换为 MASKED_SECRET_VALUE，明文不进渲染进程；
// - 表单中已有值（内置默认或已保存）的 password 字段以掩码 placeholder 展示，值留空，用户输入新值才覆盖；
// - 保存时空值 / 掩码值不落库，保留原存储值或由运行时回落到内置默认。

export const MASKED_SECRET_VALUE = '••••••••';

type SecretFieldLike = { key: string; type?: string };

export function isMaskedSecretValue(value: string | null | undefined): boolean {
  return value === MASKED_SECRET_VALUE;
}

export function listSecretFieldKeys(fields?: SecretFieldLike[] | null): Set<string> {
  return new Set((fields || []).filter((field) => field.type === 'password').map((field) => field.key));
}

// 主进程侧：下发前把 password 字段的值替换为掩码
export function maskSecretConfigValues(config: Record<string, string>, fields?: SecretFieldLike[] | null): Record<string, string> {
  const secretKeys = listSecretFieldKeys(fields);
  const masked: Record<string, string> = { ...config };
  for (const key of Object.keys(masked)) {
    if (secretKeys.has(key) && masked[key]) masked[key] = MASKED_SECRET_VALUE;
  }
  return masked;
}

// 渲染端表单初始化：拆出可回显的非敏感字段值与「已有值、仅掩码展示」的敏感字段
export function splitSecretFormValues(values: Record<string, string>, fields?: SecretFieldLike[] | null): { editableValues: Record<string, string>; maskedKeys: string[] } {
  const secretKeys = listSecretFieldKeys(fields);
  const editableValues: Record<string, string> = {};
  const maskedKeys: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (secretKeys.has(key)) {
      if (value) maskedKeys.push(key);
    } else {
      editableValues[key] = value;
    }
  }
  return { editableValues, maskedKeys };
}

// 渲染端保存：丢弃未改动的敏感字段（空值 / 掩码值），避免把掩码写回存储或覆盖原值
export function stripUnchangedSecretValues(values: Record<string, string>, fields?: SecretFieldLike[] | null): Record<string, string> {
  const secretKeys = listSecretFieldKeys(fields);
  const stripped: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (secretKeys.has(key) && (!value || isMaskedSecretValue(value))) continue;
    stripped[key] = value;
  }
  return stripped;
}
