import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const docPath = path.join(repoRoot, 'docs', 'sprite-core', 'sprite-ai-spontaneous-utterance-design.md');
const startMarker = '<!-- AUTO-GENERATED:SPRITE-AI-STATUS START -->';
const endMarker = '<!-- AUTO-GENERATED:SPRITE-AI-STATUS END -->';

const fileMap = {
  managerTypes: path.join(repoRoot, 'packages', 'sprite-core', 'manager', 'types.ts'),
  spriteManager: path.join(repoRoot, 'packages', 'sprite-core', 'manager', 'sprite-manager.ts'),
  defaultBehaviors: path.join(repoRoot, 'packages', 'sprite-core', 'manager', 'default-behaviors.ts'),
  spriteIpc: path.join(repoRoot, 'packages', 'sprite-core', 'handler', 'sprite-manager-ipc.ts'),
  mainIndex: path.join(repoRoot, 'electron', 'main', 'handlers', 'index.ts'),
  status: path.join(repoRoot, 'electron', 'main', 'handlers', 'status.ts'),
  service: path.join(repoRoot, 'electron', 'main', 'handlers', 'sprite', 'spontaneous-utterance-service.ts'),
  retrievalDbDeps: path.join(repoRoot, 'electron', 'main', 'handlers', 'memory', 'retrieval-db-deps.ts'),
  packageJson: path.join(repoRoot, 'package.json')
};

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function formatTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function statusLabel(done) {
  return done ? 'implemented' : 'pending';
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

function has(text, pattern) {
  return typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
}

function buildGeneratedBlock(checks, phases) {
  const currentChain = [
    '- Trigger path: `idle-action` -> `spontaneousUtteranceExecutor` -> `SpriteSpontaneousUtteranceService`',
    '- Context inputs: persona, role definition, recent chat, persistent memory retrieval, important dialogue digests',
    '- History log: `<workspace>/memory/logs/sprite-spontaneous-utterances-YYYY-MM-DD.jsonl`'
  ];

  const checkLines = Object.entries(checks).map(([label, done]) => `- ${label}: ${statusLabel(done)}`);
  const fileLines = [
    'packages/sprite-core/manager/types.ts',
    'packages/sprite-core/manager/sprite-manager.ts',
    'packages/sprite-core/manager/default-behaviors.ts',
    'packages/sprite-core/handler/sprite-manager-ipc.ts',
    'electron/main/handlers/index.ts',
    'electron/main/handlers/status.ts',
    'electron/main/handlers/memory/ipc-main.ts',
    'electron/main/handlers/sprite/spontaneous-utterance-service.ts',
    'electron/main/handlers/memory/retrieval-db-deps.ts',
    'package.json',
    'scripts/update-sprite-ai-doc.mjs'
  ].map((file) => `- \`${file}\``);

  return [
    startMarker,
    '## Auto Status',
    '',
    `- Last synced: ${formatTimestamp()}`,
    '- Sync command: `pnpm docs:sprite-ai:sync`',
    `- Phase 1: ${statusLabel(phases.phase1)}`,
    `- Phase 2: ${statusLabel(phases.phase2)}`,
    `- Phase 3: ${statusLabel(phases.phase3)}`,
    `- Phase 4: ${statusLabel(phases.phase4)}`,
    '',
    '### Current Chain',
    ...currentChain,
    '',
    '### Auto Checks',
    ...checkLines,
    '',
    '### Tracked Files',
    ...fileLines,
    endMarker
  ].join('\n');
}

async function main() {
  const [managerTypes, spriteManager, defaultBehaviors, spriteIpc, mainIndex, statusFile, service, retrievalDbDeps, packageJsonText, docText] =
    await Promise.all([
      readText(fileMap.managerTypes),
      readText(fileMap.spriteManager),
      readText(fileMap.defaultBehaviors),
      readText(fileMap.spriteIpc),
      readText(fileMap.mainIndex),
      readText(fileMap.status),
      readText(fileMap.service),
      readText(fileMap.retrievalDbDeps),
      readText(fileMap.packageJson),
      readText(docPath)
    ]);

  const packageJson = JSON.parse(packageJsonText);
  const checks = {
    'sprite-core injection interface':
      has(managerTypes, 'spontaneousUtteranceExecutor?: SpriteSpontaneousUtteranceExecutor') && has(spriteManager, 'getSpontaneousUtteranceExecutor()'),
    'idle-action AI orchestration': has(defaultBehaviors, 'generateForIdleAction') && has(defaultBehaviors, "silent: true"),
    'main-process spontaneous service': has(service, 'export class SpriteSpontaneousUtteranceService') && has(mainIndex, 'new SpriteSpontaneousUtteranceService()'),
    'persona / role / recent chat context': has(service, 'loadPersonaSummary') && has(statusFile, 'getStoredRoleProfile') && has(service, 'recentMessages'),
    'persistent memory retrieval': has(service, 'collectPersistentMemoryContext') && has(service, 'searchWithContent') && has(retrievalDbDeps, 'listRecentImportant'),
    'important dialogue digests':
      has(service, 'collectImportantDialogueDigests') && has(service, "'recent-chat' | 'memory-note'") && has(service, 'importantDialogueDigests'),
    'JSONL history logging': has(service, 'sprite-spontaneous-utterances-') && has(service, 'appendLog'),
    'doc sync script': has(packageJson.scripts?.['docs:sprite-ai:sync'] || '', 'scripts/update-sprite-ai-doc.mjs')
  };

  const phases = {
    phase1:
      checks['sprite-core injection interface'] &&
      checks['idle-action AI orchestration'] &&
      checks['main-process spontaneous service'] &&
      checks['persona / role / recent chat context'] &&
      checks['JSONL history logging'],
    phase2: checks['persistent memory retrieval'] && checks['important dialogue digests'],
    phase3: has(service, 'delivery') || has(service, 'ttsStyle') || has(service, 'mapToneToAction'),
    phase4: has(service, 'listSpontaneousUtterances') || has(service, 'spontaneousUtterancePreferences') || has(service, 'spontaneous-history')
  };

  const generatedBlock = buildGeneratedBlock(checks, phases);

  let nextDocText;
  if (docText.includes(startMarker) && docText.includes(endMarker)) {
    const pattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'm');
    nextDocText = docText.replace(pattern, generatedBlock);
  } else {
    const firstRuleIndex = docText.indexOf('\n---');
    if (firstRuleIndex >= 0) {
      const insertAt = firstRuleIndex + '\n---'.length;
      nextDocText = `${docText.slice(0, insertAt)}\n\n${generatedBlock}${docText.slice(insertAt)}`;
    } else {
      nextDocText = `${generatedBlock}\n\n${docText}`;
    }
  }

  if (nextDocText !== docText) {
    await fs.writeFile(docPath, nextDocText, 'utf8');
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        doc: toRepoPath(docPath),
        phases,
        checks
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
