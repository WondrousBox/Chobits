import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES, normalizeSpritePurposePlannerPreferences, type SpritePurposePlannerPreferences } from '../../../../packages/sprite-core/purpose';

const PREFERENCES_FILE = 'sprite-purpose-planner-preferences.json';

export class SpritePurposePlannerPreferencesStore {
  constructor(private readonly userDataPath: string) {}

  read(): SpritePurposePlannerPreferences {
    try {
      const raw = fsSync.readFileSync(this.getFilePath(), 'utf-8');
      return normalizeSpritePurposePlannerPreferences(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES };
    }
  }

  async write(preferences: SpritePurposePlannerPreferences): Promise<SpritePurposePlannerPreferences> {
    const normalized = normalizeSpritePurposePlannerPreferences(preferences);
    const filePath = this.getFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
    return normalized;
  }

  async update(patch: Partial<SpritePurposePlannerPreferences>): Promise<SpritePurposePlannerPreferences> {
    return this.write(
      normalizeSpritePurposePlannerPreferences({
        ...this.read(),
        ...patch
      })
    );
  }

  getFilePath(): string {
    return path.join(this.userDataPath, 'data', PREFERENCES_FILE);
  }
}
