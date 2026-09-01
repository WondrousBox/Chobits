/* eslint-disable @typescript-eslint/explicit-function-return-type */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packagesDir = path.dirname(packageDir);
const repoDir = path.dirname(packagesDir);
const publicPackageDir = path.join(packagesDir, 'workflow');

const nodeMappings = {
  'ai-chat.ts': 'nodes/ai/ai-chat.ts',
  'ai-prompt-optimizer.ts': 'nodes/ai/ai-prompt-optimizer.ts',
  'collect-folder-texts.ts': 'nodes/resource/collect-folder-texts.ts',
  'display-image.ts': 'nodes/display/display-image.ts',
  'display-media.ts': 'nodes/display/display-media.ts',
  'display-resource-card.ts': 'nodes/display/display-resource-card.ts',
  'display-text.ts': 'nodes/display/display-text.ts',
  'doc-to-md.ts': 'nodes/media/doc-to-md.ts',
  'extract-keyframes.ts': 'nodes/media/extract-keyframes.ts',
  'generate-learning-card.ts': 'nodes/rendering/generate-learning-card.ts',
  'image-generate.ts': 'nodes/ai/image-generate.ts',
  'image-understand.ts': 'nodes/ai/image-understand.ts',
  'music-generate.ts': 'nodes/ai/music-generate.ts',
  'ocr.ts': 'nodes/ocr/ocr.ts',
  'paddle-ocr.ts': 'nodes/ocr/paddle-ocr.ts',
  'resource-create.ts': 'nodes/resource/resource-create.ts',
  'resource-load.ts': 'nodes/resource/resource-load.ts',
  'resource-update.ts': 'nodes/resource/resource-update.ts',
  'start.ts': 'nodes/core/start.ts',
  'text-to-image.ts': 'nodes/rendering/text-to-image.ts',
  'transcode-advanced.ts': 'nodes/media/transcode-advanced.ts',
  'transcode.ts': 'nodes/media/transcode.ts',
  'transcribe-fast-whisper.ts': 'nodes/media/transcribe-fast-whisper.ts',
  'transcribe-funasr.ts': 'nodes/media/transcribe-funasr.ts',
  'transcribe-parakeet.ts': 'nodes/media/transcribe-parakeet.ts',
  'transcribe-whisper.ts': 'nodes/media/transcribe-whisper.ts'
};

const capabilityNodes = new Set([
  'ai-chat.ts',
  'ai-prompt-optimizer.ts',
  'collect-folder-texts.ts',
  'extract-keyframes.ts',
  'generate-learning-card.ts',
  'image-generate.ts',
  'image-understand.ts',
  'music-generate.ts',
  'ocr.ts',
  'paddle-ocr.ts',
  'resource-create.ts',
  'resource-load.ts',
  'resource-update.ts',
  'text-to-image.ts',
  'transcode-advanced.ts',
  'transcode.ts',
  'transcribe-fast-whisper.ts',
  'transcribe-funasr.ts',
  'transcribe-parakeet.ts',
  'transcribe-whisper.ts'
]);

const pluginMappings = {
  'fast-whisper.ts': 'plugins/fast-whisper.ts',
  'ffmpeg.ts': 'plugins/ffmpeg.ts',
  'funasr.ts': 'plugins/funasr.ts',
  'paddle-ocr.ts': 'plugins/paddle-ocr.ts',
  'parakeet.ts': 'plugins/parakeet.ts',
  'tesseract.ts': 'plugins/tesseract.ts',
  'whisper.ts': 'plugins/whisper.ts'
};

function listTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listTypeScriptFiles(entryPath) : /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
if (manifest.name !== '@workflow/integrations') throw new Error('Workflow integrations package name is invalid');
if (manifest.private !== true) throw new Error('@workflow/integrations must remain private');
for (const requiredExport of ['./capabilities', './adapters', './client', './nodes', './persistence', './plugins']) {
  if (!manifest.exports?.[requiredExport]) throw new Error(`Missing private package export: ${requiredExport}`);
}

for (const [legacyName, privateRelativePath] of Object.entries(nodeMappings)) {
  const legacyPath = path.join(publicPackageDir, 'nodes', legacyName);
  const privatePath = path.join(packageDir, 'src', privateRelativePath);
  const legacySource = fs.readFileSync(legacyPath, 'utf8').trim();
  const privateSource = fs.readFileSync(privatePath, 'utf8');
  if (!legacySource.startsWith('export ') || !legacySource.includes('@workflow/integrations/')) {
    throw new Error(`Legacy business node must only forward to the private package: ${legacyName}`);
  }
  if (!privateSource.includes('export const ')) throw new Error(`Missing private node implementation: ${privateRelativePath}`);
  if (privateSource.includes('ctx.services') || privateSource.includes('services?.')) throw new Error(`Private node still uses ExecutionContext.services: ${privateRelativePath}`);
  if (capabilityNodes.has(legacyName) && !privateSource.includes('requiredCapabilities:')) {
    throw new Error(`Private node must declare required capabilities: ${privateRelativePath}`);
  }
}

for (const [legacyName, privateRelativePath] of Object.entries(pluginMappings)) {
  const legacySource = fs.readFileSync(path.join(publicPackageDir, 'plugins', legacyName), 'utf8').trim();
  const privateSource = fs.readFileSync(path.join(packageDir, 'src', privateRelativePath), 'utf8');
  if (!legacySource.startsWith('export ') || !legacySource.includes('@workflow/integrations/plugins')) {
    throw new Error(`Legacy workflow plugin must only forward to the private package: ${legacyName}`);
  }
  if (!privateSource.includes('export const ')) throw new Error(`Missing private plugin implementation: ${privateRelativePath}`);
}

for (const sourcePath of listTypeScriptFiles(path.join(publicPackageDir, 'src'))) {
  if (fs.readFileSync(sourcePath, 'utf8').includes('@workflow/integrations')) {
    throw new Error(`Public workflow source imports the private package: ${path.relative(publicPackageDir, sourcePath)}`);
  }
}

const privateStorePath = path.join(packageDir, 'src', 'persistence', 'workflow-store.ts');
if (!fs.readFileSync(privateStorePath, 'utf8').includes("from 'drizzle-orm'")) throw new Error('Host application workflow store implementation is missing from the private package');
const legacyStore = fs.readFileSync(path.join(publicPackageDir, 'store.ts'), 'utf8').trim();
if (!legacyStore.includes('@workflow/integrations/persistence')) throw new Error('Legacy workflow store must forward to the private package');

const hostCompositionPath = path.join(repoDir, 'electron', 'main', 'workflow', 'composition-root.ts');
if (!fs.existsSync(hostCompositionPath)) throw new Error('Electron workflow composition root is missing');
const legacyEntry = fs.readFileSync(path.join(publicPackageDir, 'index.ts'), 'utf8');
if (!legacyEntry.includes('electron/main/workflow') || legacyEntry.includes('BrowserWindow')) throw new Error('Legacy workflow entry must only forward to the Electron workflow host');
const schedulerSource = fs.readFileSync(path.join(repoDir, 'electron', 'main', 'handlers', 'scheduler.ts'), 'utf8');
if (schedulerSource.includes('packages/workflow/index')) throw new Error('Scheduler must receive the workflow runtime facade');
const aiToolSource = fs.readFileSync(path.join(packagesDir, 'ai', 'runtime', 'pi', 'tools', 'workflow-run.ts'), 'utf8');
if (aiToolSource.includes('workflow/index')) throw new Error('AI workflow tool must receive the workflow runtime facade');
for (const sourcePath of listTypeScriptFiles(path.join(repoDir, 'src'))) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  if (/ipcRenderer\s*\.\s*(?:invoke|on|off)\s*\(\s*['"]wf:/.test(source)) {
    throw new Error(`Renderer must use the typed workflow client: ${path.relative(repoDir, sourcePath)}`);
  }
}

console.log(`workflow integrations boundary checked: ${Object.keys(nodeMappings).length} compatibility nodes, ${capabilityNodes.size} capability nodes, ${Object.keys(pluginMappings).length} plugins`);
