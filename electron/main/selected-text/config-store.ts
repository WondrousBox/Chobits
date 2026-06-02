import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import type { SelectedTextLearningConfig, SelectedTextLearningConfigPatch } from './types';

const DEFAULT_CONFIG: SelectedTextLearningConfig = {
  autoSpeak: true,
  dedupeWindowMs: 8000,
  enabled: true,
  holdMs: 1500,
  maxTextLength: 2000,
  restoreClipboard: true,
  showOverlay: true
};

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'data', 'selected-text-learning.json');
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizeConfig(value: unknown): SelectedTextLearningConfig {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    autoSpeak: normalizeBoolean(source.autoSpeak, DEFAULT_CONFIG.autoSpeak),
    dedupeWindowMs: normalizeNumber(source.dedupeWindowMs, DEFAULT_CONFIG.dedupeWindowMs, 1000, 60000),
    enabled: normalizeBoolean(source.enabled, DEFAULT_CONFIG.enabled),
    holdMs: normalizeNumber(source.holdMs, DEFAULT_CONFIG.holdMs, 500, 10000),
    maxTextLength: normalizeNumber(source.maxTextLength, DEFAULT_CONFIG.maxTextLength, 20, 10000),
    restoreClipboard: normalizeBoolean(source.restoreClipboard, DEFAULT_CONFIG.restoreClipboard),
    showOverlay: normalizeBoolean(source.showOverlay, DEFAULT_CONFIG.showOverlay)
  };
}

export class SelectedTextLearningConfigStore {
  private cached: SelectedTextLearningConfig | null = null;

  load(): SelectedTextLearningConfig {
    if (this.cached) return this.cached;
    const file = getConfigPath();
    try {
      if (fs.existsSync(file)) {
        this.cached = normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
        return this.cached;
      }
    } catch (error) {
      console.warn('[selected-text] failed to read config:', error);
    }

    this.cached = { ...DEFAULT_CONFIG };
    this.save(this.cached);
    return this.cached;
  }

  save(patch: SelectedTextLearningConfigPatch): SelectedTextLearningConfig {
    const next = normalizeConfig({ ...this.load(), ...patch });
    this.cached = next;
    try {
      const file = getConfigPath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
    } catch (error) {
      console.warn('[selected-text] failed to save config:', error);
    }
    return next;
  }
}
