import fs from 'node:fs';
import path from 'node:path';

import { getResourcePath } from '../../electron/main/utils/resources-path';
import { ProviderConfig } from './types';

/**
 * Load provider config schema from packaged JSON under resources/providers/<id>.schema.json
 * Falls back to the given defaultSchema when file missing or invalid.
 */
export function loadProviderSchema(id: string, defaultSchema: ProviderConfig): ProviderConfig {
  try {
    const schemaDir = getResourcePath('providers');
    const file = path.join(schemaDir, `${id}.schema.json`);
    if (!fs.existsSync(file)) return defaultSchema;
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    // shallow validate minimal shape
    if (!parsed || typeof parsed !== 'object') return defaultSchema;
    if (!parsed.id || !parsed.label || !Array.isArray(parsed.fields)) return defaultSchema;
    // ensure enabled defaults to true if not specified
    if (typeof parsed.enabled !== 'boolean') parsed.enabled = true;
    return parsed as ProviderConfig;
  } catch {
    return defaultSchema;
  }
}
