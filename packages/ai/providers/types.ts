import type { ProviderAdapter, ProviderCapabilities, ProviderConfig, ProviderDefaultModels } from '../types';

export type BuiltinProviderId = 'anthropic' | 'deepseek' | 'gemini' | 'ollama' | 'openai' | 'qwen' | 'zhipu';

export type BuiltinProviderKind = 'anthropic' | 'gemini' | 'ollama' | 'openai' | 'openai-compatible';

export type ProviderDefinitionSource = 'builtin' | 'plugin';

export type ProviderModelStrategy = 'builtin' | 'remote' | 'hybrid';

export interface ProviderModelAbilities {
  files?: boolean;
  functionCall?: boolean;
  imageOutput?: boolean;
  reasoning?: boolean;
  search?: boolean;
  structuredOutput?: boolean;
  video?: boolean;
  vision?: boolean;
}

export interface ProviderModelDefinition {
  id: string;
  providerId?: string;
  displayName?: string;
  type?: string;
  enabled?: boolean;
  contextWindowTokens?: number;
  maxOutput?: number;
  description?: string;
  releasedAt?: string;
  tags?: string[];
  abilities?: ProviderModelAbilities | Record<string, boolean>;
  pricing?: Record<string, any>;
  settings?: Record<string, any>;
  [k: string]: any;
}

export interface ProviderProtocolDefinition {
  kind: BuiltinProviderKind | 'custom';
  baseUrl?: string;
  piBaseUrl?: string;
}

export interface ProviderDisplayDefinition {
  label: string;
  description?: string;
  icon?: string;
  website?: string;
  order?: number;
}

export interface ProviderCatalogDefinition {
  name?: string;
  apiKeyUrl?: string;
  checkModel?: string;
  modelsUrl?: string;
  enabled?: boolean;
  defaultShowBrowserRequest?: boolean;
  disableBrowserRequest?: boolean;
  proxyUrl?:
    | {
        desc?: string;
        placeholder: string;
        title?: string;
      }
    | false;
  showApiKey?: boolean;
  settings?: Record<string, any>;
}

export interface ProviderRuntimeDefinition {
  mode: 'driver' | 'module';
  modulePath?: string;
  exportName?: string;
}

export interface ProviderRuntimeModule {
  createAdapter(definition: ProviderDefinition): ProviderAdapter | Promise<ProviderAdapter>;
}

export type ProviderRuntimeModuleFactory = (definition: ProviderDefinition) => ProviderRuntimeModule | Promise<ProviderRuntimeModule>;

export type ProviderRuntimeModuleExport = ProviderRuntimeModule | ProviderRuntimeModuleFactory;

export interface ProviderCompatibilityDefinition {
  legacyIds?: string[];
  storageIds?: string[];
}

export interface ProviderModelsDefinition {
  strategy: ProviderModelStrategy;
  items?: ProviderModelDefinition[];
  cacheTtlMs?: number;
}

export interface ProviderDefinition {
  id: string;
  aliases?: string[];
  source: ProviderDefinitionSource;
  display: ProviderDisplayDefinition;
  catalog?: ProviderCatalogDefinition;
  protocol: ProviderProtocolDefinition;
  capabilities: ProviderCapabilities;
  defaults: {
    models: ProviderDefaultModels;
    config?: Record<string, any>;
  };
  schema?: ProviderConfig;
  models?: ProviderModelsDefinition;
  runtime?: ProviderRuntimeDefinition;
  compatibility?: ProviderCompatibilityDefinition;
}

export interface BuiltinProviderDefinition extends Omit<ProviderDefinition, 'id' | 'source' | 'protocol' | 'defaults' | 'schema'> {
  id: BuiltinProviderId;
  source: 'builtin';
  protocol: ProviderProtocolDefinition & { kind: BuiltinProviderKind };
  defaults: {
    models: ProviderDefaultModels & { chat: string };
    config?: Record<string, any>;
  };
  schema: ProviderConfig;
}

export function isBuiltinProviderDefinition(definition: ProviderDefinition): definition is BuiltinProviderDefinition {
  return definition.source === 'builtin';
}
