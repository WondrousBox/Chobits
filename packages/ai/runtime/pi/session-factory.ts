import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { AgentSession } from '@mariozechner/pi-coding-agent';

import type { ResolvedPiRequest } from './contracts';
import { createPiSessionToolContext } from './tool-context';
import { createPiCustomTools } from './tools';

type PiModel = import('@mariozechner/pi-ai').Model<any>;
type PiAgentThinkingLevel = import('@mariozechner/pi-agent-core').ThinkingLevel;

type PiCodingAuthStorageModule = typeof import('@mariozechner/pi-coding-agent').AuthStorage;
type PiCodingModelRegistryModule = typeof import('@mariozechner/pi-coding-agent').ModelRegistry;
type PiCodingResourceLoaderModule = typeof import('@mariozechner/pi-coding-agent').DefaultResourceLoader;
type PiCodingSdkModule = Pick<typeof import('@mariozechner/pi-coding-agent'), 'createAgentSession'>;
type PiCodingSessionManagerModule = typeof import('@mariozechner/pi-coding-agent').SessionManager;
type PiCodingSettingsManagerModule = typeof import('@mariozechner/pi-coding-agent').SettingsManager;
type PiCodingCoreModules = {
  AuthStorage: PiCodingAuthStorageModule;
  DefaultResourceLoader: PiCodingResourceLoaderModule;
  ModelRegistry: PiCodingModelRegistryModule;
  SessionManager: PiCodingSessionManagerModule;
  SettingsManager: PiCodingSettingsManagerModule;
  createAgentSession: PiCodingSdkModule['createAgentSession'];
};

export interface CreatePiCodingSessionOptions {
  model: PiModel;
  resolved: ResolvedPiRequest;
  systemPrompt?: string;
  thinkingLevel?: PiAgentThinkingLevel;
}

export interface PiCodingSessionHandle {
  session: AgentSession;
  dispose: () => void;
}

function resolveLocalPiCodingPackageRoot(): string | undefined {
  const packageRoot = path.join(process.cwd(), 'node_modules', '@mariozechner', 'pi-coding-agent');
  return fs.existsSync(path.join(packageRoot, 'package.json')) ? packageRoot : undefined;
}

async function resolvePiCodingCorePath(fileName: string): Promise<string> {
  const localPackageRoot = resolveLocalPiCodingPackageRoot();
  if (localPackageRoot) {
    return path.join(localPackageRoot, 'dist', 'core', fileName);
  }

  const entryUrl = await import.meta.resolve('@mariozechner/pi-coding-agent');
  const entryPath = fileURLToPath(entryUrl);
  const packageRoot = path.resolve(path.dirname(entryPath), '..');
  return path.join(packageRoot, 'dist', 'core', fileName);
}

async function importPiCodingCoreModule<TModule>(fileName: string): Promise<TModule> {
  const modulePath = await resolvePiCodingCorePath(fileName);
  return import(pathToFileURL(modulePath).href) as Promise<TModule>;
}

async function loadPiCodingCore(): Promise<PiCodingCoreModules> {
  const [authStorageModule, modelRegistryModule, resourceLoaderModule, sdkModule, sessionManagerModule, settingsManagerModule] = await Promise.all([
    importPiCodingCoreModule<PiCodingAuthStorageModule>('auth-storage.js'),
    importPiCodingCoreModule<PiCodingModelRegistryModule>('model-registry.js'),
    importPiCodingCoreModule<PiCodingResourceLoaderModule>('resource-loader.js'),
    importPiCodingCoreModule<PiCodingSdkModule>('sdk.js'),
    importPiCodingCoreModule<PiCodingSessionManagerModule>('session-manager.js'),
    importPiCodingCoreModule<PiCodingSettingsManagerModule>('settings-manager.js')
  ]);

  return {
    AuthStorage: authStorageModule.AuthStorage,
    DefaultResourceLoader: resourceLoaderModule.DefaultResourceLoader,
    ModelRegistry: modelRegistryModule.ModelRegistry,
    SessionManager: sessionManagerModule.SessionManager,
    SettingsManager: settingsManagerModule.SettingsManager,
    createAgentSession: sdkModule.createAgentSession
  };
}

function seedRuntimeApiKeys(
  authStorage: {
    set: (providerId: string, credential: { key: string; type: 'api_key' }) => void;
  },
  resolved: ResolvedPiRequest,
  model: PiModel
): void {
  const apiKey = resolved.model.apiKey?.trim();
  if (!apiKey) return;

  const providerIds = new Set<string>([resolved.model.providerId, resolved.model.canonicalProviderId, String(model.provider || '')].filter(Boolean));

  for (const providerId of providerIds) {
    authStorage.set(providerId, {
      key: apiKey,
      type: 'api_key'
    });
  }
}

export class PiSessionFactory {
  async createCodingSession(options: CreatePiCodingSessionOptions): Promise<PiCodingSessionHandle> {
    const { AuthStorage, DefaultResourceLoader, ModelRegistry, SessionManager, SettingsManager, createAgentSession } = await loadPiCodingCore();
    const cwd = process.cwd();
    const authStorage = AuthStorage.inMemory();
    seedRuntimeApiKeys(authStorage, options.resolved, options.model);
    const customTools = createPiCustomTools(options.resolved.enabledToolIds, createPiSessionToolContext(options.resolved));

    const modelRegistry = new ModelRegistry(authStorage, '');
    const settingsManager = SettingsManager.inMemory({
      enableSkillCommands: false,
      followUpMode: 'one-at-a-time',
      steeringMode: 'one-at-a-time',
      transport: 'sse'
    });

    const resourceLoader = new DefaultResourceLoader({
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      cwd,
      noExtensions: true,
      noPromptTemplates: true,
      noSkills: true,
      noThemes: true,
      settingsManager,
      systemPrompt: options.systemPrompt
    });

    await resourceLoader.reload();

    const { session } = await createAgentSession({
      authStorage,
      customTools,
      cwd,
      model: options.model,
      modelRegistry,
      resourceLoader,
      sessionManager: SessionManager.inMemory(cwd),
      settingsManager,
      thinkingLevel: options.thinkingLevel || 'off',
      tools: []
    });

    return {
      dispose: () => {
        session.dispose();
      },
      session
    };
  }
}
