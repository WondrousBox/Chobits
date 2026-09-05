export type ProviderVisibilityRow = {
  configured?: boolean;
};

// 过滤未配置 API key 的服务商：仅显式 configured === false 才隐藏，undefined（老数据/未返回）保持显示
export function filterUnconfiguredProviders<T extends ProviderVisibilityRow>(providers: T[]): T[] {
  return providers.filter((provider) => provider.configured !== false);
}
