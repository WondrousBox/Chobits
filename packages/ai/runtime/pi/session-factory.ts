import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { AgentSession } from '@earendil-works/pi-coding-agent';

import type { ResolvedPiRequest } from './contracts';
import { installSameTurnDynamicToolActivation } from './dynamic-tool-activation';
import { createSkillRegistry, createSkillSessionState, type SkillRegistry, type SkillSessionState } from './skills';
import { createPiSessionToolContext, type PiSessionToolContext } from './tool-context';
import { resolvePiToolId } from './tool-registry';
import { createPiCustomTools, listPiReadyToolIds } from './tools';

type PiModel = import('@earendil-works/pi-ai/compat').Model<any>;
type PiAgentThinkingLevel = import('@earendil-works/pi-agent-core').ThinkingLevel;

type PiCodingSdkModule = Pick<typeof import('@earendil-works/pi-coding-agent'), 'createAgentSession'>;
// pi-coding-agent 0.80.10+：AuthStorage 实现 CredentialStore（只读 modify 接口），
// 凭证在 inMemory(data) 构造时注入；ModelRegistry 被 ModelRuntime 取代
type PiCodingAuthCredential = { key: string; type: 'api_key' };
type PiCodingAuthStorage = unknown;
type PiCodingAuthStorageClass = {
  AuthStorage: {
    inMemory: (data?: Record<string, PiCodingAuthCredential>) => PiCodingAuthStorage;
  };
}['AuthStorage'];
type PiCodingModelRuntime = {
  getProvider: (providerId: string) => unknown;
  registerProvider: (providerId: string, config: Record<string, unknown>) => void;
};
type PiCodingModelRuntimeClass = {
  ModelRuntime: {
    create: (options: { allowModelNetwork?: boolean; credentials: PiCodingAuthStorage; modelsPath?: string | null }) => Promise<PiCodingModelRuntime>;
  };
}['ModelRuntime'];
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
  ModelRuntime: PiCodingModelRuntimeClass;
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
  const [authStorageModule, modelRuntimeModule, resourceLoaderModule, sdkModule, sessionManagerModule, settingsManagerModule] = await Promise.all([
    importPiCodingCoreModule<{ AuthStorage: PiCodingAuthStorageClass }>('auth-storage.js'),
    importPiCodingCoreModule<{ ModelRuntime: PiCodingModelRuntimeClass }>('model-runtime.js'),
    importPiCodingCoreModule<{ DefaultResourceLoader: PiCodingResourceLoaderClass }>('resource-loader.js'),
    importPiCodingCoreModule<PiCodingSdkModule>('sdk.js'),
    importPiCodingCoreModule<{ SessionManager: PiCodingSessionManagerClass }>('session-manager.js'),
    importPiCodingCoreModule<{ SettingsManager: PiCodingSettingsManagerClass }>('settings-manager.js')
  ]);

  return {
    AuthStorage: authStorageModule.AuthStorage,
    DefaultResourceLoader: resourceLoaderModule.DefaultResourceLoader,
    ModelRuntime: modelRuntimeModule.ModelRuntime,
    SessionManager: sessionManagerModule.SessionManager,
    SettingsManager: settingsManagerModule.SettingsManager,
    createAgentSession: sdkModule.createAgentSession
  };
}

function buildRuntimeApiKeyData(resolved: ResolvedPiRequest, model: PiModel): Record<string, PiCodingAuthCredential> {
  const apiKey = resolved.model.apiKey?.trim();
  if (!apiKey) return {};

  const providerIds = new Set<string>([resolved.model.providerId, resolved.model.canonicalProviderId, String(model.provider || '')].filter(Boolean));

  const data: Record<string, PiCodingAuthCredential> = {};
  for (const providerId of providerIds) {
    data[providerId] = {
      key: apiKey,
      type: 'api_key'
    };
  }
  return data;
}

/**
 * 0.80.10 的 ModelRuntime 只认识 pi-ai 内置/已注册的 provider：自定义 provider（如自托管
 * vllm）不注册的话，即使凭证已注入，hasConfiguredAuth/checkAuth 也恒为 false。
 * 这里把解析出的 baseUrl + 模型注册进运行时；pi-ai 已内置的 provider 跳过。
 */
function registerRuntimeProviders(modelRuntime: PiCodingModelRuntime, resolved: ResolvedPiRequest, model: PiModel): void {
  const providerIds = new Set<string>([resolved.model.providerId, resolved.model.canonicalProviderId, String(model.provider || '')].filter(Boolean));
  const modelAny = model as Record<string, any>;
  const baseUrl = resolved.model.baseUrl?.trim() || (typeof modelAny.baseUrl === 'string' ? modelAny.baseUrl : undefined);

  for (const providerId of providerIds) {
    if (modelRuntime.getProvider(providerId)) continue;
    modelRuntime.registerProvider(providerId, {
      api: modelAny.api,
      baseUrl,
      models: [
        {
          contextWindow: modelAny.contextWindow || 8192,
          cost: modelAny.cost || { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
          id: modelAny.id,
          input: modelAny.input || ['text'],
          maxTokens: modelAny.maxTokens || 8192,
          name: modelAny.name || modelAny.id,
          reasoning: Boolean(modelAny.reasoning)
        }
      ]
    });
  }
}

function hasSkillToolsEnabled(resolved: ResolvedPiRequest): boolean {
  const enabledToolIds = new Set(resolved.enabledToolIds.map((toolId) => resolvePiToolId(toolId) || toolId));
  return enabledToolIds.has('skill-search') && enabledToolIds.has('skill-use');
}

function resolvePiRuntimeAgentDir(): string {
  return path.join(os.tmpdir(), 'chobits-pi-runtime');
}

export class PiSessionFactory {
  async createCodingSession(options: CreatePiCodingSessionOptions): Promise<PiCodingSessionHandle> {
    const { AuthStorage, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, createAgentSession } = await loadPiCodingCore();
    const cwd = options.resolved.coding?.rootPath?.trim() || process.cwd();
    const agentDir = resolvePiRuntimeAgentDir();
    const authStorage = AuthStorage.inMemory(buildRuntimeApiKeyData(options.resolved, options.model));
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

    // ModelRuntime 取代旧 ModelRegistry：凭证走 CredentialStore，模型目录不持久化、不走网络
    const modelRuntime = await ModelRuntime.create({
      allowModelNetwork: false,
      credentials: authStorage,
      modelsPath: null
    });
    registerRuntimeProviders(modelRuntime, options.resolved, options.model);
    const settingsManager = SettingsManager.inMemory({
      enableSkillCommands: false,
      followUpMode: 'one-at-a-time',
      steeringMode: 'one-at-a-time',
      transport: 'sse'
    });

    const resourceLoader = new DefaultResourceLoader({
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      agentDir,
      cwd,
      noExtensions: true,
      noContextFiles: true,
      noPromptTemplates: true,
      noSkills: true,
      noThemes: true,
      settingsManager,
      systemPrompt: options.systemPrompt
    });

    await resourceLoader.reload();

    const { session } = await (createAgentSession as any)({
      agentDir,
      customTools: allTools,
      cwd,
      model: options.model,
      modelRuntime,
      resourceLoader,
      sessionManager: SessionManager.inMemory(cwd),
      settingsManager,
      thinkingLevel: options.thinkingLevel || 'off',
      // Keep SDK built-ins disabled, but do not pass `tools: []`: the SDK treats
      // that as an empty allowlist and filters out every custom tool.
      noTools: 'builtin'
    });

    // WORKAROUND: pi-coding-agent's constructor calls _buildRuntime with
    // includeAllExtensionTools: true, which appends ALL customTools to the
    // active set — defeating initialActiveToolNames. Force-reset here.
    // In 'all' mode this is a no-op since all tools are already intended to be active.
    session.setActiveToolsByName(initialActiveNames);

    // pi-agent-core snapshots tools at prompt start. Refresh the next-turn context
    // after toolbox activation so newly active tool schemas are available in the
    // next model request within the same user turn.
    installSameTurnDynamicToolActivation(session);

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
