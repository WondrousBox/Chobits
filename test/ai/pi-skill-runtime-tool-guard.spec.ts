import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}));

import { createSkillSessionState, SkillRegistry } from '../../packages/ai/runtime/pi/skills';
import type { SkillRegistryEntry } from '../../packages/ai/runtime/pi/skills';
import { createPiFileWriteTool } from '../../packages/ai/runtime/pi/tools/file-write';
import { createPiPushCardTool } from '../../packages/ai/runtime/pi/tools/push-card';
import { createPiShellExecTool } from '../../packages/ai/runtime/pi/tools/shell-exec';

class MockChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn();
}

const tempRoots: string[] = [];

afterEach(async () => {
  spawnMock.mockReset();
  await Promise.all(
    tempRoots.splice(0).map(async (targetPath) => {
      await fs.rm(targetPath, { force: true, recursive: true });
    })
  );
});

describe('guarded skill runtime tool enforcement', () => {
  it('blocks high-impact file writes when a guarded skill is active but not yet approved', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-skill-tool-guard-file-'));
    tempRoots.push(workspaceRoot);

    const state = createSkillSessionState();
    state.activeSkillNames.add('danger-write');

    const registry = SkillRegistry.fromEntries([
      createEntry({
        allowedToolIds: ['file-write'],
        description: 'Plugin skill that wants to write files.',
        name: 'danger-write',
        source: 'plugin'
      })
    ]);

    const tool = createPiFileWriteTool(createToolContext(workspaceRoot, registry, state) as any);
    const result = (await tool.execute('call-1', { content: 'blocked\n', path: 'notes/result.txt' })).details as any;

    expect(result).toMatchObject({
      success: false,
      requiresConfirmation: true,
      tool: 'fileWriteTool'
    });
    expect(result.guardedSkills).toMatchObject([
      {
        name: 'danger-write',
        source: 'plugin',
        sourcePolicy: {
          riskLevel: 'guarded'
        }
      }
    ]);
  });

  it('blocks push-card side effects when a guarded plugin skill is active but not yet approved', async () => {
    const state = createSkillSessionState();
    state.activeSkillNames.add('danger-card');

    const registry = SkillRegistry.fromEntries([
      createEntry({
        allowedToolIds: ['push-card'],
        description: 'Plugin skill that wants to push cards into chat.',
        name: 'danger-card',
        source: 'plugin'
      })
    ]);

    const pushCardToWindows = vi.fn();
    const tool = createPiPushCardTool(
      createToolContext(process.cwd(), registry, state, {
        conversationId: 'conv-guarded',
        pushCardToWindows
      }) as any
    );

    const result = (await tool.execute('call-push-1', { resourceId: 'res-1', type: 'resource' })).details as any;

    expect(result).toMatchObject({
      success: false,
      requiresConfirmation: true,
      tool: 'pushCardTool'
    });
    expect(result.guardedSkills).toMatchObject([
      {
        name: 'danger-card',
        source: 'plugin',
        sourcePolicy: {
          riskLevel: 'guarded'
        }
      }
    ]);
    expect(pushCardToWindows).not.toHaveBeenCalled();
  });

  it('asks for confirmation before guarded shell execution and remembers approval for later calls', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-skill-tool-guard-shell-'));
    tempRoots.push(workspaceRoot);

    const tscScriptPath = path.join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    await fs.mkdir(path.dirname(tscScriptPath), { recursive: true });
    await fs.writeFile(tscScriptPath, '', 'utf8');

    spawnMock.mockImplementation(() => {
      const child = new MockChildProcess();
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('guard ok'));
        child.emit('close', 0);
      });
      return child;
    });

    const state = createSkillSessionState();
    state.activeSkillNames.add('danger-shell');

    const registry = SkillRegistry.fromEntries([
      createEntry({
        allowedToolIds: ['shell-exec'],
        description: 'Plugin skill that wants shell access.',
        name: 'danger-shell',
        source: 'plugin'
      })
    ]);

    let choiceRequests = 0;
    const tool = createPiShellExecTool(
      createToolContext(workspaceRoot, registry, state, {
        emitUserChoiceRequest: (request: any) => {
          choiceRequests += 1;
          expect(request.prompt).toContain('shellExecTool');
        },
        waitForUserChoiceResponse: async () => ({
          answers: {
            guarded_tool_execution: ['continue']
          },
          choiceId: 'choice-1'
        })
      }) as any
    );

    const firstResult = (await tool.execute('call-2', { args: ['tsconfig.json'], command: 'tsc' })).details as any;
    expect(firstResult.success).toBe(true);
    expect(firstResult.warning).toContain('User explicitly confirmed guarded tool execution');
    expect(state.approvedGuardedSkillNames.has('danger-shell')).toBe(true);
    expect(choiceRequests).toBe(1);

    const secondResult = (await tool.execute('call-3', { args: ['tsconfig.json'], command: 'tsc' })).details as any;
    expect(secondResult.success).toBe(true);
    expect(choiceRequests).toBe(1);
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});

function createToolContext(workspaceRoot: string, registry: SkillRegistry, state: ReturnType<typeof createSkillSessionState>, overrides: Record<string, unknown> = {}) {
  return {
    coding: {
      rootPath: workspaceRoot,
      label: path.basename(workspaceRoot),
      mode: 'safe',
      source: 'manual'
    },
    resolved: {},
    skillRegistry: registry,
    skillSessionState: state,
    ...overrides
  };
}

function createEntry(overrides: Partial<SkillRegistryEntry['record']> = {}): SkillRegistryEntry {
  const name = overrides.name || 'skill';

  return {
    locator: { kind: 'skill-file' },
    priority: 10,
    rawFrontmatter: {},
    record: {
      activationToolIds: [],
      aliases: [],
      allowedToolIds: [],
      argumentHint: undefined,
      argumentNames: [],
      contentHash: `${name}-hash`,
      description: `${name} description`,
      disableModelInvocation: false,
      name,
      paths: undefined,
      skillDir: `/tmp/${name}`,
      skillFilePath: `/tmp/${name}/SKILL.md`,
      source: 'bundled',
      tags: [],
      userInvocable: true,
      whenToUse: undefined,
      ...overrides
    }
  };
}
