import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { PluginConfigStore } from '../../../plugins/plugin-config-store';
import { registerProvider } from '../../registry';
import { BUILTIN_PROVIDER_DEFINITIONS } from '../builtins';
import { registerProviderDefinition } from '../registry';
import { registerBuiltinProviderDefinitions } from '../service';
import type { ProviderDefinition } from '../types';
import { PROVIDER_PLUGIN_MANIFEST_FILE, type ProviderPluginLoadResult, type ProviderPluginLoadWarning } from './manifest';
import { createPluginProviderAdapter } from './runtime';
import { validateProviderPluginManifest } from './validator';

let cachedRegistrationResult: ProviderPluginLoadResult | undefined;
let cachedRegistrationPromise: Promise<ProviderPluginLoadResult> | undefined;

function cloneLoadResult(result: ProviderPluginLoadResult): ProviderPluginLoadResult {
  return {
    definitions: result.definitions.map((definition) => ({ ...definition })),
    files: [...result.files],
    warnings: result.warnings.map((warning) => ({ ...warning }))
  };
}

function toWarning(message: string, filePath?: string): ProviderPluginLoadWarning {
  return filePath ? { message, path: filePath } : { message };
}

export function getProviderPluginSearchRoots(): string[] {
  return Array.from(
    new Set([
      path.resolve(app.getPath('userData'), 'providers'),
      path.resolve(PluginConfigStore.getPluginsDir(), 'providers')
    ])
  );
}

export function discoverProviderPluginManifestFiles(): string[] {
  const files: string[] = [];

  for (const root of getProviderPluginSearchRoots()) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const manifestPath = path.join(root, entry.name, PROVIDER_PLUGIN_MANIFEST_FILE);
      if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).isFile()) {
        files.push(manifestPath);
      }
    }
  }

  return files.sort();
}

export function loadProviderPluginDefinitions(): ProviderPluginLoadResult {
  const warnings: ProviderPluginLoadWarning[] = [];
  const definitions: ProviderDefinition[] = [];
  const files = discoverProviderPluginManifestFiles();
  const seenIds = new Map<string, string>();

  for (const filePath of files) {
    let raw: unknown;

    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
      warnings.push(toWarning(`failed to parse JSON: ${(error as Error).message}`, filePath));
      continue;
    }

    const validation = validateProviderPluginManifest(raw, filePath);
    if (validation.ok) {
      const normalizedId = validation.definition.id.trim().toLowerCase();
      const firstSeen = seenIds.get(normalizedId);
      if (firstSeen) {
        warnings.push(toWarning(`duplicate plugin provider id "${normalizedId}" (already loaded from ${firstSeen})`, filePath));
        continue;
      }

      seenIds.set(normalizedId, filePath);
      definitions.push(validation.definition);
    } else if ('errors' in validation) {
      for (const error of validation.errors) {
        warnings.push(toWarning(error, filePath));
      }
    }
  }

  return { definitions, files, warnings };
}

export async function registerProviderPluginDefinitions(): Promise<ProviderPluginLoadResult> {
  if (cachedRegistrationResult) {
    return cloneLoadResult(cachedRegistrationResult);
  }

  if (cachedRegistrationPromise) {
    return cachedRegistrationPromise.then((result) => cloneLoadResult(result));
  }

  cachedRegistrationPromise = (async () => {
    registerBuiltinProviderDefinitions();

    const loaded = loadProviderPluginDefinitions();
    const warnings = [...loaded.warnings];
    const definitions: ProviderDefinition[] = [];
    const builtinIds = new Set(BUILTIN_PROVIDER_DEFINITIONS.map((definition) => definition.id));
    const manifestFileById = new Map<string, string>();

    for (const filePath of loaded.files) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const validation = validateProviderPluginManifest(raw, filePath);
        if (validation.ok) {
          manifestFileById.set(validation.definition.id.trim().toLowerCase(), filePath);
        }
      } catch {
        // Keep warning generation in loadProviderPluginDefinitions as the source of truth.
      }
    }

    for (const definition of loaded.definitions) {
      const manifestPath = manifestFileById.get(definition.id.trim().toLowerCase());

      if (builtinIds.has(definition.id as typeof BUILTIN_PROVIDER_DEFINITIONS[number]['id'])) {
        warnings.push(toWarning(`plugin provider id "${definition.id}" conflicts with a built-in provider`, manifestPath));
        continue;
      }

      try {
        const registeredDefinition = registerProviderDefinition(definition);
        definitions.push(registeredDefinition);

        const adapterResult = await createPluginProviderAdapter(registeredDefinition);
        for (const warning of adapterResult.warnings) {
          warnings.push(toWarning(warning, manifestPath));
        }

        if (adapterResult.adapter) {
          registerProvider(adapterResult.adapter);
        }
      } catch (error) {
        warnings.push(toWarning((error as Error).message, manifestPath));
      }
    }

    cachedRegistrationResult = {
      definitions,
      files: loaded.files,
      warnings
    };

    return cachedRegistrationResult;
  })();

  try {
    const result = await cachedRegistrationPromise;
    return cloneLoadResult(result);
  } finally {
    cachedRegistrationPromise = undefined;
  }
}
