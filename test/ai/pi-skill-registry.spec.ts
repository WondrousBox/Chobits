import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createSkillRegistry, loadSyntheticToolboxSkillEntries } from '../../packages/ai/runtime/pi/skills';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (targetPath) => {
      await fs.rm(targetPath, { force: true, recursive: true });
    })
  );
});

describe('SkillRegistry', () => {
  it('respects bundled < user < project < plugin precedence and prefers nearer project roots', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-skill-registry-'));
    tempRoots.push(tempRoot);

    const bundledRoot = path.join(tempRoot, 'bundled');
    const homeDir = path.join(tempRoot, 'home');
    const pluginRoot = path.join(tempRoot, 'plugins', 'demo-skill-pack');
    const repoRoot = path.join(tempRoot, 'repo');
    const workspaceRoot = path.join(repoRoot, 'apps', 'demo');

    await fs.mkdir(path.join(repoRoot, '.git'), { recursive: true });

    await writeSkill(path.join(bundledRoot, 'shared', 'SKILL.md'), 'shared', 'bundled version');
    await writeSkill(path.join(homeDir, '.claude', 'skills', 'shared', 'SKILL.md'), 'shared', 'user version');
    await writeSkill(path.join(repoRoot, '.chobits', 'skills', 'shared', 'SKILL.md'), 'shared', 'project root version');
    await writeSkill(path.join(workspaceRoot, '.chobits', 'skills', 'shared', 'SKILL.md'), 'shared', 'workspace project version');
    await writeSkill(path.join(pluginRoot, 'shared', 'SKILL.md'), 'shared', 'plugin version');
    await writeSkill(path.join(workspaceRoot, '.claude', 'skills', 'extra', 'SKILL.md'), 'extra', 'workspace extra version');

    const registry = await createSkillRegistry({
      bundledSkillRoot: bundledRoot,
      homeDir,
      includeSyntheticToolbox: false,
      pluginSkillRoots: [pluginRoot],
      workspaceRoot
    });

    expect(registry.get('shared')).toMatchObject({
      description: 'plugin version',
      source: 'plugin',
      sourceInfo: {
        label: 'Plugin: demo-skill-pack',
        trustNote: expect.stringContaining('Plugin-provided skill'),
        trustLevel: 'plugin'
      }
    });
    expect(registry.get('extra')).toMatchObject({
      description: 'workspace extra version',
      source: 'project'
    });
    expect(
      registry
        .list()
        .map((skill) => skill.name)
        .sort()
    ).toEqual(['extra', 'shared']);
    expect(registry.issues.filter((issue) => issue.code === 'skill-overridden')).toHaveLength(4);
  });

  it('auto-discovers plugin skill roots from the configured plugins directory', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-skill-plugin-roots-'));
    tempRoots.push(tempRoot);

    const bundledRoot = path.join(tempRoot, 'bundled');
    const homeDir = path.join(tempRoot, 'home');
    const pluginsDir = path.join(tempRoot, 'plugins');
    const workspaceRoot = path.join(tempRoot, 'repo');

    await fs.mkdir(path.join(workspaceRoot, '.git'), { recursive: true });
    await writeSkill(path.join(workspaceRoot, '.chobits', 'skills', 'shared', 'SKILL.md'), 'shared', 'project version');
    await writeSkill(path.join(pluginsDir, 'review-pack', 'skills', 'shared', 'SKILL.md'), 'shared', 'plugin version');
    await writeSkill(path.join(pluginsDir, 'helpers', 'pi-skills', 'helper-skill', 'SKILL.md'), 'helper-skill', 'plugin helper version');

    const registry = await createSkillRegistry({
      bundledSkillRoot: bundledRoot,
      discoverPluginRoots: true,
      homeDir,
      includeSyntheticToolbox: false,
      pluginsDir,
      workspaceRoot
    });

    expect(registry.get('shared')).toMatchObject({
      description: 'plugin version',
      source: 'plugin',
      sourceInfo: {
        label: 'Plugin: review-pack',
        trustNote: expect.stringContaining('Plugin-provided skill'),
        trustLevel: 'plugin'
      }
    });
    expect(registry.get('helper-skill')).toMatchObject({
      description: 'plugin helper version',
      source: 'plugin',
      sourceInfo: {
        label: 'Plugin: helpers',
        trustNote: expect.stringContaining('Plugin-provided skill'),
        trustLevel: 'plugin'
      }
    });
  });

  it('generates synthetic toolbox skills with normalized tool ids', () => {
    const { entries, issues } = loadSyntheticToolboxSkillEntries();

    expect(issues).toEqual([]);

    const cardPush = entries.find((entry) => entry.record.name === '卡片推送');
    expect(cardPush?.record).toMatchObject({
      activationToolIds: ['push-card'],
      allowedToolIds: ['push-card'],
      aliases: ['给我看看', '推送卡片', '推荐', '分享链接'],
      source: 'synthetic-toolbox',
      userInvocable: true
    });
  });
});

async function writeSkill(skillFilePath: string, name: string, description: string) {
  await fs.mkdir(path.dirname(skillFilePath), { recursive: true });
  await fs.writeFile(
    skillFilePath,
    `---
name: ${name}
description: ${description}
---
# ${name}
`,
    'utf8'
  );
}
