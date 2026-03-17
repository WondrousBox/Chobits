import path from 'node:path';

import type { ProviderCapabilities, ProviderConfig, ProviderDefaultModels } from '../../types';
import type {
  ProviderCatalogDefinition,
  ProviderCompatibilityDefinition,
  ProviderDefinition,
  ProviderDisplayDefinition,
  ProviderModelDefinition,
  ProviderModelsDefinition,
  ProviderProtocolDefinition,
  ProviderRuntimeDefinition
} from '../types';
import { PROVIDER_PLUGIN_MANIFEST_VERSION } from './manifest';

const SUPPORTED_PROTOCOL_KINDS = new Set(['anthropic', 'custom', 'gemini', 'ollama', 'openai', 'openai-compatible']);
const SUPPORTED_MODEL_STRATEGIES = new Set(['builtin', 'hybrid', 'remote']);
const SUPPORTED_RUNTIME_MODES = new Set(['driver', 'module']);

type ValidationSuccess = {
  definition: ProviderDefinition;
  ok: true;
};

type ValidationFailure = {
  errors: string[];
  ok: false;
};

export type ProviderPluginValidationResult = ValidationSuccess | ValidationFailure;

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = Array.from(new Set(value.map((item) => toOptionalString(item)).filter(Boolean) as string[]));
  return items.length > 0 ? items : [];
}

function cloneRecord<T extends Record<string, any>>(value: T | undefined): T | undefined {
  return value ? ({ ...value } as T) : undefined;
}

function cloneRecordArray<T extends Record<string, any>>(items: T[] | undefined): T[] | undefined {
  return items ? items.map((item) => ({ ...item })) : undefined;
}

function isUriLike(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function resolveManifestRelativePath(manifestPath: string, value?: string): string | undefined {
  if (!value) return undefined;
  if (path.isAbsolute(value) || isUriLike(value) || value.startsWith('providers/')) {
    return value;
  }
  return path.resolve(path.dirname(manifestPath), value);
}

function resolveManifestModulePath(manifestPath: string, value?: string): string | undefined {
  if (!value) return undefined;
  if (path.isAbsolute(value) || isUriLike(value)) {
    return value;
  }
  return path.resolve(path.dirname(manifestPath), value);
}

function normalizeCapabilities(value: unknown, errors: string[]): ProviderCapabilities {
  if (value != null && !isRecord(value)) {
    errors.push('capabilities must be an object when provided');
  }

  const source = isRecord(value) ? value : {};
  const keys: Array<keyof ProviderCapabilities> = ['chat', 'embeddings', 'imageGeneration', 'modelListing', 'transcribe'];

  for (const key of keys) {
    if (key in source && typeof source[key] !== 'boolean') {
      errors.push(`capabilities.${key} must be a boolean`);
    }
  }

  return {
    chat: toOptionalBoolean(source.chat) ?? true,
    embeddings: toOptionalBoolean(source.embeddings) ?? false,
    imageGeneration: toOptionalBoolean(source.imageGeneration) ?? false,
    modelListing: toOptionalBoolean(source.modelListing) ?? true,
    transcribe: toOptionalBoolean(source.transcribe) ?? false
  };
}

function normalizeDefaultModels(value: unknown, errors: string[]): ProviderDefaultModels {
  if (!isRecord(value)) {
    errors.push('defaults.models is required');
    return {};
  }

  const keys: Array<keyof ProviderDefaultModels> = ['chat', 'embeddings', 'imageGeneration', 'transcribe'];
  const result: ProviderDefaultModels = {};

  for (const key of keys) {
    const normalized = toOptionalString(value[key]);
    if (key in value && value[key] != null && !normalized) {
      errors.push(`defaults.models.${key} must be a non-empty string`);
    }
    if (normalized) {
      result[key] = normalized;
    }
  }

  return result;
}

function normalizeDisplay(value: unknown, manifestPath: string, errors: string[]): ProviderDisplayDefinition | undefined {
  if (!isRecord(value)) {
    errors.push('display is required');
    return undefined;
  }

  const label = toOptionalString(value.label);
  if (!label) {
    errors.push('display.label is required');
    return undefined;
  }

  return {
    label,
    ...(toOptionalString(value.description) ? { description: toOptionalString(value.description) } : {}),
    ...(toOptionalString(value.icon) ? { icon: resolveManifestRelativePath(manifestPath, toOptionalString(value.icon)) } : {}),
    ...(toOptionalString(value.website) ? { website: toOptionalString(value.website) } : {}),
    ...(toOptionalNumber(value.order) != null ? { order: toOptionalNumber(value.order) } : {})
  };
}

function normalizeProtocol(value: unknown, errors: string[]): ProviderProtocolDefinition | undefined {
  if (!isRecord(value)) {
    errors.push('protocol is required');
    return undefined;
  }

  const kind = toOptionalString(value.kind);
  if (!kind || !SUPPORTED_PROTOCOL_KINDS.has(kind)) {
    errors.push(`protocol.kind must be one of: ${Array.from(SUPPORTED_PROTOCOL_KINDS).join(', ')}`);
    return undefined;
  }

  return {
    kind: kind as ProviderProtocolDefinition['kind'],
    ...(toOptionalString(value.baseUrl) ? { baseUrl: toOptionalString(value.baseUrl) } : {}),
    ...(toOptionalString(value.piBaseUrl) ? { piBaseUrl: toOptionalString(value.piBaseUrl) } : {})
  };
}

function normalizeSchema(value: unknown, manifestPath: string, id: string, label: string, errors: string[]): ProviderConfig | undefined {
  if (value == null) return undefined;
  if (!isRecord(value)) {
    errors.push('schema must be an object when provided');
    return undefined;
  }

  if (!Array.isArray(value.fields)) {
    errors.push('schema.fields must be an array');
    return undefined;
  }

  const fields = value.fields.map((field, index) => {
    if (!isRecord(field)) {
      errors.push(`schema.fields[${index}] must be an object`);
      return undefined;
    }

    const key = toOptionalString(field.key);
    const fieldLabel = toOptionalString(field.label);
    const type = toOptionalString(field.type);

    if (!key) errors.push(`schema.fields[${index}].key is required`);
    if (!fieldLabel) errors.push(`schema.fields[${index}].label is required`);
    if (!type || !['password', 'select', 'text'].includes(type)) {
      errors.push(`schema.fields[${index}].type must be one of: text, password, select`);
    }

    let options: Array<{ label: string; value: string }> | undefined;
    if (field.options != null) {
      if (!Array.isArray(field.options)) {
        errors.push(`schema.fields[${index}].options must be an array when provided`);
      } else {
        options = field.options
          .map((option, optionIndex) => {
            if (!isRecord(option)) {
              errors.push(`schema.fields[${index}].options[${optionIndex}] must be an object`);
              return undefined;
            }
            const optionLabel = toOptionalString(option.label);
            const optionValue = toOptionalString(option.value);
            if (!optionLabel || !optionValue) {
              errors.push(`schema.fields[${index}].options[${optionIndex}] requires label and value`);
              return undefined;
            }
            return { label: optionLabel, value: optionValue };
          })
          .filter(Boolean) as Array<{ label: string; value: string }>;
      }
    }

    if (!key || !fieldLabel || !type || !['password', 'select', 'text'].includes(type)) {
      return undefined;
    }

    return {
      key,
      label: fieldLabel,
      type: type as ProviderConfig['fields'][number]['type'],
      ...(toOptionalBoolean(field.required) != null ? { required: toOptionalBoolean(field.required) } : {}),
      ...(options ? { options } : {})
    };
  });

  if (errors.length > 0) {
    return undefined;
  }

  return {
    id: toOptionalString(value.id) || id,
    label: toOptionalString(value.label) || label,
    enabled: toOptionalBoolean(value.enabled) ?? true,
    ...(toOptionalString(value.icon) ? { icon: resolveManifestRelativePath(manifestPath, toOptionalString(value.icon)) } : {}),
    ...(isRecord(value.locales) ? { locales: cloneRecord(value.locales) } : {}),
    fields: fields.filter(Boolean) as ProviderConfig['fields']
  };
}

function normalizeModels(value: unknown, errors: string[]): ProviderModelsDefinition | undefined {
  if (value == null) return undefined;
  if (!isRecord(value)) {
    errors.push('models must be an object when provided');
    return undefined;
  }

  const strategy = toOptionalString(value.strategy);
  if (strategy && !SUPPORTED_MODEL_STRATEGIES.has(strategy)) {
    errors.push(`models.strategy must be one of: ${Array.from(SUPPORTED_MODEL_STRATEGIES).join(', ')}`);
  }

  let items: ProviderModelDefinition[] | undefined;
  if (value.items != null) {
    if (!Array.isArray(value.items)) {
      errors.push('models.items must be an array when provided');
    } else {
      items = value.items
        .map((item, index) => {
          if (!isRecord(item)) {
            errors.push(`models.items[${index}] must be an object`);
            return undefined;
          }
          const id = toOptionalString(item.id);
          if (!id) {
            errors.push(`models.items[${index}].id is required`);
            return undefined;
          }
          return { ...item, id };
        })
        .filter(Boolean) as ProviderModelDefinition[];
    }
  }

  if (errors.length > 0) {
    return undefined;
  }

  return {
    strategy: (strategy || (items?.length ? 'builtin' : 'remote')) as ProviderModelsDefinition['strategy'],
    ...(items ? { items: cloneRecordArray(items) } : {}),
    ...(toOptionalNumber(value.cacheTtlMs) != null ? { cacheTtlMs: toOptionalNumber(value.cacheTtlMs) } : {})
  };
}

function normalizeRuntime(value: unknown, manifestPath: string, protocol: ProviderProtocolDefinition | undefined, errors: string[]): ProviderRuntimeDefinition | undefined {
  if (value == null) {
    if (protocol?.kind === 'custom') {
      errors.push('runtime.mode="module" is required when protocol.kind is custom');
      return undefined;
    }
    return { mode: 'driver' };
  }

  if (!isRecord(value)) {
    errors.push('runtime must be an object when provided');
    return undefined;
  }

  const mode = toOptionalString(value.mode);
  if (!mode || !SUPPORTED_RUNTIME_MODES.has(mode)) {
    errors.push(`runtime.mode must be one of: ${Array.from(SUPPORTED_RUNTIME_MODES).join(', ')}`);
    return undefined;
  }

  if (protocol?.kind === 'custom' && mode !== 'module') {
    errors.push('custom protocol providers must use runtime.mode="module"');
    return undefined;
  }

  if (mode === 'module') {
    const modulePath = toOptionalString(value.modulePath);
    if (!modulePath) {
      errors.push('runtime.modulePath is required when runtime.mode is module');
      return undefined;
    }

    return {
      mode: mode as ProviderRuntimeDefinition['mode'],
      modulePath: resolveManifestModulePath(manifestPath, modulePath),
      exportName: toOptionalString(value.exportName) || 'createProviderRuntime'
    };
  }

  return { mode: mode as ProviderRuntimeDefinition['mode'] };
}

function normalizeCatalog(value: unknown): ProviderCatalogDefinition | undefined {
  if (!isRecord(value)) return undefined;

  return {
    ...(toOptionalString(value.name) ? { name: toOptionalString(value.name) } : {}),
    ...(toOptionalString(value.apiKeyUrl) ? { apiKeyUrl: toOptionalString(value.apiKeyUrl) } : {}),
    ...(toOptionalString(value.checkModel) ? { checkModel: toOptionalString(value.checkModel) } : {}),
    ...(toOptionalString(value.modelsUrl) ? { modelsUrl: toOptionalString(value.modelsUrl) } : {}),
    ...(toOptionalBoolean(value.enabled) != null ? { enabled: toOptionalBoolean(value.enabled) } : {}),
    ...(toOptionalBoolean(value.defaultShowBrowserRequest) != null ? { defaultShowBrowserRequest: toOptionalBoolean(value.defaultShowBrowserRequest) } : {}),
    ...(toOptionalBoolean(value.disableBrowserRequest) != null ? { disableBrowserRequest: toOptionalBoolean(value.disableBrowserRequest) } : {}),
    ...(value.proxyUrl === false || isRecord(value.proxyUrl) ? { proxyUrl: value.proxyUrl === false ? false : cloneRecord(value.proxyUrl) } : {}),
    ...(toOptionalBoolean(value.showApiKey) != null ? { showApiKey: toOptionalBoolean(value.showApiKey) } : {}),
    ...(isRecord(value.settings) ? { settings: cloneRecord(value.settings) } : {})
  };
}

function normalizeCompatibility(value: unknown): ProviderCompatibilityDefinition | undefined {
  if (!isRecord(value)) return undefined;

  const legacyIds = normalizeStringArray(value.legacyIds);
  const storageIds = normalizeStringArray(value.storageIds);

  if (!legacyIds && !storageIds) return undefined;

  return {
    ...(legacyIds ? { legacyIds } : {}),
    ...(storageIds ? { storageIds } : {})
  };
}

export function validateProviderPluginManifest(raw: unknown, manifestPath: string): ProviderPluginValidationResult {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: ['manifest root must be an object'] };
  }

  const manifestVersion = raw.manifestVersion;
  if (manifestVersion !== PROVIDER_PLUGIN_MANIFEST_VERSION) {
    errors.push(`manifestVersion must be ${PROVIDER_PLUGIN_MANIFEST_VERSION}`);
  }

  const source = toOptionalString(raw.source);
  if (source && source !== 'plugin') {
    errors.push('source must be "plugin" when provided');
  }

  const id = toOptionalString(raw.id);
  if (!id) {
    errors.push('id is required');
  }

  const display = normalizeDisplay(raw.display, manifestPath, errors);
  const protocol = normalizeProtocol(raw.protocol, errors);
  const capabilities = normalizeCapabilities(raw.capabilities, errors);
  const defaultsRecord = isRecord(raw.defaults) ? raw.defaults : undefined;
  if (!defaultsRecord) {
    errors.push('defaults is required');
  }
  const defaultModels = normalizeDefaultModels(defaultsRecord?.models, errors);

  if (capabilities.chat && !defaultModels.chat) {
    errors.push('defaults.models.chat is required when capabilities.chat is enabled');
  }

  const schema = id && display ? normalizeSchema(raw.schema, manifestPath, id, display.label, errors) : undefined;
  const models = normalizeModels(raw.models, errors);
  const runtime = normalizeRuntime(raw.runtime, manifestPath, protocol, errors);
  const catalog = normalizeCatalog(raw.catalog);
  const compatibility = normalizeCompatibility(raw.compatibility);

  if (!id || !display || !protocol || errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    definition: {
      id,
      aliases: normalizeStringArray(raw.aliases),
      source: 'plugin',
      display,
      ...(catalog ? { catalog } : {}),
      protocol,
      capabilities,
      defaults: {
        models: defaultModels,
        ...(defaultsRecord && isRecord(defaultsRecord.config) ? { config: cloneRecord(defaultsRecord.config) } : {})
      },
      ...(schema ? { schema } : {}),
      ...(models ? { models } : {}),
      ...(runtime ? { runtime } : {}),
      ...(compatibility ? { compatibility } : {})
    }
  };
}
