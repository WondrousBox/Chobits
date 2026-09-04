import type { ProviderDefinition } from '../types';

export const PROVIDER_PLUGIN_MANIFEST_VERSION = 1 as const;
export const PROVIDER_PLUGIN_MANIFEST_FILE = 'provider.json';

export interface ProviderPluginLoadWarning {
  message: string;
  path?: string;
}

export interface ProviderPluginLoadResult {
  definitions: ProviderDefinition[];
  files: string[];
  warnings: ProviderPluginLoadWarning[];
}
