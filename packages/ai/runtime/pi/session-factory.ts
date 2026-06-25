import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { AgentSession } from '@earendil-works/pi-coding-agent';

import type { ResolvedPiRequest } from './contracts';
import { createSkillRegistry, createSkillSessionState, type SkillRegistry, type SkillSessionState } from './skills';
import { createPiSessionToolContext, type PiSessionToolContext } from './tool-context';
import { resolvePiToolId } from './tool-registry';
import { createPiCustomTools, listPiReadyToolIds } from './tools';

type PiModel = import('@earendil-works/pi-ai/compat').Model<any>;
type PiAgentThinkingLevel = import('@earendil-works/pi-agent-core').ThinkingLevel;

type PiCodingSdkModule = Pick<typeof import('@earendil-works/pi-coding-agent'), 'createAgentSession'>;
type PiCodingAuthStorage = {
  set: (providerId: string, credential: { key: string; type: 'api_key' }) => void;
};
type PiCodingAuthStorageClass = {
  AuthStorage: {
    inMemory: (data?: Record<string, unknown>) => PiCodingAuthStorage;
  };
}['AuthStorage'];
type PiCodingModelRegistryClass = {
  ModelRegistry: new (authStorage: PiCodingAuthStorage, modelsPath: string) => unknown;
}['ModelRegistry'];
type PiCodingSettingsManager = unknown;
type PiCodingSettingsManagerClass = {
  SettingsManager: {
    inMemory: (settings?: Record<string, unknown>) => PiCodingSettingsManager;
  };
}['SettingsManager'];
type PiCodingResourceLoader = {
  reload: () => Promise<void>;
};
type PiCodingResourceLoaderClass = {
  DefaultResourceLoader: new (options: Record<string, unknown>) => PiCodingResourceLoader;
}['DefaultResourceLoader'];
type PiCodingSessionManagerClass = {
  SessionManager: {
    inMemory: (cwd?: string) => unknown;
  };
}['SessionManager'];
type PiCodingCoreModules = {
  AuthStorage: PiCodingAuthStorageClass;
  DefaultResourceLoader: PiCodingResourceLoaderClass;
  ModelRegistry: PiCodingModelRegistryClass;
  SessionManager: PiCodingSessionManagerClass;
  SettingsManager: PiCodingSettingsManagerClass;
  createAgentSession: PiCodingSdkModule['createAgentSession'];
};

export interface CreatePiCodingSessionOptions {
  model: PiModel;
  resolved: ResolvedPiRequest;
  skillRegistry?: SkillRegistry;
  skillSessionState?: SkillSessionState;
  systemPrompt?: string;
  thinkingLevel?: PiAgentThinkingLevel;
}

export interface PiCodingSessionHandle {
  session: AgentSession;
  toolContext: PiSessionToolContext;
  dispose: () => void;
}

function resolveLocalPiCodingPackageRoot(): string | undefined {
  const packageRoot = path.join(process.cwd(), 'node_modules', '@earendil-works', 'pi-coding-agent');
  return fs.existsSync(path.join(packageRoot, 'package.json')) ? packageRoot : undefined;
}

async function resolvePiCodingCorePath(fileName: string): Promise<string> {
  const localPackageRoot = resolveLocalPiCodingPackageRoot();
  if (localPackageRoot) {
    return path.join(localPackageRoot, 'dist', 'core', fileName);
  }

  const entryUrl = await import.meta.resolve('@earendil-works/pi-coding-agent');
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
    importPiCodingCoreModule<{ AuthStorage: PiCodingAuthStorageClass }>('auth-storage.js'),
    importPiCodingCoreModule<{ ModelRegistry: PiCodingModelRegistryClass }>('model-registry.js'),
    importPiCodingCoreModule<{ DefaultResourceLoader: PiCodingResourceLoaderClass }>('resource-loader.js'),
    importPiCodingCoreModule<PiCodingSdkModule>('sdk.js'),
    importPiCodingCoreModule<{ SessionManager: PiCodingSessionManagerClass }>('session-manager.js'),
    importPiCodingCoreModule<{ SettingsManager: PiCodingSettingsManagerClass }>('settings-manager.js')
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

function seedRuntimeApiKeys(authStorage: PiCodingAuthStorage, resolved: ResolvedPiRequest, model: PiModel): void {
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

function hasSkillToolsEnabled(resolved: ResolvedPiRequest): boolean {
  const enabledToolIds = new Set(resolved.enabledToolIds.map((toolId) => resolvePiToolId(toolId) || toolId));
  return enabledToolIds.has('skill-search') && enabledToolIds.has('skill-use');
}

export class PiSessionFactory {
  async createCodingSession(options: CreatePiCodingSessionOptions): Promise<PiCodingSessionHandle> {
    const { AuthStorage, DefaultResourceLoader, ModelRegistry, SessionManager, SettingsManager, createAgentSession } = await loadPiCodingCore();
    const cwd = options.resolved.coding?.rootPath?.trim() || process.cwd();
    const authStorage = AuthStorage.inMemory();
    seedRuntimeApiKeys(authStorage, options.resolved, options.model);
    const toolContext = createPiSessionToolContext(options.resolved);

    const shouldAttachSkillRuntime = Boolean(options.skillRegistry || options.skillSessionState || hasSkillToolsEnabled(options.resolved));
    if (shouldAttachSkillRuntime) {
      const skillRegistry =
        options.skillRegistry ||
        (await createSkillRegistry({
          discoverPluginRoots: true,
          includeBundled: false,
          includeSyntheticToolbox: false,
          workspaceRoot: cwd
        }));

      toolContext.skillRegistry = skillRegistry;
      toolContext.skillSessionState = options.skillSessionState || createSkillSessionState();

      if (skillRegistry.issues.length > 0) {
        console.warn('[PiSession] skill registry issues:', skillRegistry.issues.slice(0, 5));
        if (skillRegistry.issues.length > 5) {
          console.warn('[PiSession] skill registry issues truncated:', skillRegistry.issues.length - 5);
        }
      }
    }

    // Register ALL tools into the session registry (so they can be dynamically activated later)
    const allToolIds = listPiReadyToolIds();
    const allTools = createPiCustomTools(allToolIds, toolContext);

    // Determine initial active tools based on injection mode
    const injectionMode = options.resolved.profile.toolInjectionMode ?? 'dynamic';
    const initialActiveNames = injectionMode === 'all' ? allTools.map((t) => t.name) : createPiCustomTools(options.resolved.enabledToolIds, toolContext).map((t) => t.name);

    console.log('[PiSession] mode:', injectionMode, '| registered:', allTools.length, 'tools, initially active:', initialActiveNames.length);

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

    const { session } = await (createAgentSession as any)({
      authStorage,
      customTools: allTools,
      cwd,
      initialActiveToolNames: initialActiveNames,
      model: options.model,
      modelRegistry,
      resourceLoader,
      sessionManager: SessionManager.inMemory(cwd),
      settingsManager,
      thinkingLevel: options.thinkingLevel || 'off',
      tools: []
    });

    // PATCH: pi-agent-core's runLoop captures context.tools (array reference) once at the start.
    // Agent.setTools() replaces the reference (this._state.tools = newArray), so tools activated
    // mid-loop via toolbox never appear in the LLM's tools parameter until the next prompt() call.
    // Fix: mutate the array IN-PLACE so the existing reference sees the new tools immediately.
    const agentInner = (session as any).agent;
    if (agentInner && typeof agentInner.setTools === 'function') {
      agentInner.setTools = function (t: any[]) {
        const arr = this._state.tools;
        arr.length = 0;
        arr.push(...t);
      };
    }

    // WORKAROUND: pi-coding-agent's constructor calls _buildRuntime with
    // includeAllExtensionTools: true, which appends ALL customTools to the
    // active set — defeating initialActiveToolNames. Force-reset here.
    // In 'all' mode this is a no-op since all tools are already intended to be active.
    session.setActiveToolsByName(initialActiveNames);

    console.log('[PiSession] active tools after reset:', session.getActiveToolNames().length);

    // Wire session into toolContext so toolbox can dynamically activate/deactivate tools
    toolContext.session = {
      getActiveToolNames: () => session.getActiveToolNames(),
      setActiveToolsByName: (names: string[]) => session.setActiveToolsByName(names),
      getAllTools: () => allTools as Array<{ name: string; description: string }>
    };

    return {
      dispose: () => {
        session.dispose();
      },
      session,
      toolContext
    };
  }
}
