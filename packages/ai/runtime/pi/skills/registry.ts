import { loadSkillSourceEntries } from './source-loader';
import type { LoadSkillSourcesOptions, SkillIssue, SkillRecord, SkillRegistryEntry } from './types';

export class SkillRegistry {
  readonly issues: SkillIssue[];

  private readonly entries: SkillRegistryEntry[];
  private readonly entriesByName: Map<string, SkillRegistryEntry>;

  private constructor(entries: SkillRegistryEntry[], issues: SkillIssue[]) {
    this.entries = entries;
    this.entriesByName = new Map(entries.map((entry) => [normalizeSkillName(entry.record.name), entry]));
    this.issues = issues;
  }

  static async create(options: LoadSkillSourcesOptions = {}): Promise<SkillRegistry> {
    const loaded = await loadSkillSourceEntries(options);
    return SkillRegistry.fromEntries(loaded.entries, loaded.issues);
  }

  static fromEntries(entries: SkillRegistryEntry[], issues: SkillIssue[] = []): SkillRegistry {
    const dedupeIssues = [...issues];
    const winningEntries = new Map<string, SkillRegistryEntry>();

    for (const entry of entries) {
      const normalizedName = normalizeSkillName(entry.record.name);
      const currentWinner = winningEntries.get(normalizedName);

      if (!currentWinner) {
        winningEntries.set(normalizedName, entry);
        continue;
      }

      if (entry.priority >= currentWinner.priority) {
        winningEntries.set(normalizedName, entry);
        dedupeIssues.push({
          severity: 'warning',
          code: 'skill-overridden',
          message: `Skill "${entry.record.name}" from ${entry.record.source} overrides the earlier definition from ${currentWinner.record.source}.`,
          filePath: entry.record.skillFilePath,
          skillName: entry.record.name,
          source: entry.record.source
        });
        continue;
      }

      dedupeIssues.push({
        severity: 'warning',
        code: 'skill-shadowed',
        message: `Skill "${entry.record.name}" from ${entry.record.source} is ignored because a higher-priority definition already exists.`,
        filePath: entry.record.skillFilePath,
        skillName: entry.record.name,
        source: entry.record.source
      });
    }

    const finalEntries = entries.filter((entry) => winningEntries.get(normalizeSkillName(entry.record.name)) === entry);
    return new SkillRegistry(finalEntries, dedupeIssues);
  }

  has(skillName: string): boolean {
    return this.entriesByName.has(normalizeSkillName(skillName));
  }

  get(skillName: string): SkillRecord | undefined {
    return this.getEntry(skillName)?.record;
  }

  getEntry(skillName: string): SkillRegistryEntry | undefined {
    return this.entriesByName.get(normalizeSkillName(skillName));
  }

  list(): SkillRecord[] {
    return this.entries.map((entry) => entry.record);
  }

  listEntries(): SkillRegistryEntry[] {
    return [...this.entries];
  }

  listModelVisible(): SkillRecord[] {
    return this.list().filter((record) => !record.disableModelInvocation);
  }

  listUserInvocable(): SkillRecord[] {
    return this.list().filter((record) => record.userInvocable);
  }
}

export async function createSkillRegistry(options: LoadSkillSourcesOptions = {}): Promise<SkillRegistry> {
  return SkillRegistry.create(options);
}

function normalizeSkillName(skillName: string): string {
  return skillName.trim().toLowerCase();
}
