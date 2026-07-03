import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { DEFAULT_PROJECT_TRACKING_CONFIG, normalizeProjectTrackingConfig } from '../../../../packages/ai/services/project-tracking-service';
import type { ProjectTrackingConfig } from '../../../../packages/ai/services/project-tracking-types';

const CONFIG_DIR = path.join(app.getPath('userData'), 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'project-tracking-config.json');

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

export function getProjectTrackingConfig(): ProjectTrackingConfig {
  ensureConfigDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return normalizeProjectTrackingConfig(data);
    }
  } catch {
    // ignore parse errors and fall back to defaults
  }
  return normalizeProjectTrackingConfig(DEFAULT_PROJECT_TRACKING_CONFIG);
}

export function setProjectTrackingConfig(patch: Partial<ProjectTrackingConfig>): ProjectTrackingConfig {
  const current = getProjectTrackingConfig();
  const updated = normalizeProjectTrackingConfig({ ...current, ...patch });
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
  return updated;
}
