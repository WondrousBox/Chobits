export type SkillSource = 'bundled' | 'user' | 'project' | 'plugin' | 'synthetic-toolbox';
export type InstructionSource = 'user' | 'project';
export type SkillExecutionContext = 'inline' | 'fork';
export type SkillEffortLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type SkillTrustLevel = 'trusted' | 'workspace' | 'plugin' | 'compatibility';
export type SkillSourcePolicyRiskLevel = 'normal' | 'caution' | 'guarded';

export interface SkillSourceInfo {
  detail?: string;
  label: string;
  trustNote?: string;
  trustLevel: SkillTrustLevel;
}

export interface SkillSourcePolicy {
  message: string;
  recommendedMode: 'inline' | 'preview';
  requiresExplicitUserIntent: boolean;
  requiresPreviewBeforeInline: boolean;
  riskLevel: SkillSourcePolicyRiskLevel;
  sensitiveToolCategories: string[];
  sensitiveToolIds: string[];
}

export interface SkillRecord {
  name: string;
  description: string;
  whenToUse?: string;
  argumentNames: string[];
  argumentHint?: string;
  allowedToolIds: string[];
  activationToolIds: string[];
  aliases: string[];
  tags: string[];
  userInvocable: boolean;
  disableModelInvocation: boolean;
  executionContext?: SkillExecutionContext;
  model?: string;
  effort?: SkillEffortLevel;
  paths?: string[];
  source: SkillSource;
  sourcePolicy?: SkillSourcePolicy;
  sourceInfo?: SkillSourceInfo;
  sourceRootDir?: string;
  skillDir: string;
  skillFilePath: string;
  contentHash: string;
}

export interface ParsedSkillMetadata extends Omit<SkillRecord, 'source' | 'sourceInfo' | 'sourceRootDir' | 'skillDir' | 'skillFilePath' | 'contentHash'> {
  rawFrontmatter: Record<string, unknown>;
}

export interface SkillSessionState {
  activeSkillNames: Set<string>;
  activatedToolNames: Set<string>;
  approvedGuardedSkillNames: Set<string>;
  discoveredSkillNames: Set<string>;
  lastDiscoveryAt?: number;
  loadedSkillNames: Set<string>;
}

export type SkillContentLocator = { kind: 'skill-file' } | { kind: 'toolbox-section'; sectionName: string; lineStart: number; lineEnd: number };

export interface SkillRegistryEntry {
  record: SkillRecord;
  priority: number;
  locator: SkillContentLocator;
  rawFrontmatter: Record<string, unknown>;
}

export interface SkillSearchResult {
  matchedFields: string[];
  pathsMatched: boolean;
  record: SkillRecord;
  score: number;
}

export interface SkillIssue {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  filePath?: string;
  skillName?: string;
  source?: SkillSource;
}

export interface ParseSkillMarkdownOptions {
  filePath?: string;
}

export interface ParseSkillMarkdownResult {
  body: string;
  issues: SkillIssue[];
  metadata?: ParsedSkillMetadata;
  rawFrontmatter: Record<string, unknown>;
}

export interface LoadSkillSourcesOptions {
  bundledSkillRoot?: string;
  discoverPluginRoots?: boolean;
  homeDir?: string;
  includeBundled?: boolean;
  includePlugins?: boolean;
  includeProject?: boolean;
  includeSyntheticToolbox?: boolean;
  includeUserGlobal?: boolean;
  pluginsDir?: string;
  pluginSkillRoots?: string[];
  workspaceRoot?: string;
}

export interface LoadSkillSourcesResult {
  entries: SkillRegistryEntry[];
  issues: SkillIssue[];
  scannedRoots: string[];
  scannedSkillFiles: string[];
}

export interface SkillExecutionOptions {
  args?: Record<string, string>;
  mode?: 'inline' | 'preview';
  sessionId?: string;
  state?: SkillSessionState;
  workspaceRoot?: string;
}

export interface SkillExecutionResult {
  activatedToolNames: string[];
  activationToolIds: string[];
  allowedToolIds: string[];
  content: string;
  effort?: SkillEffortLevel;
  executionContext: SkillExecutionContext;
  executionMode: 'inline' | 'preview';
  model?: string;
  pathsMatched: boolean;
  record: SkillRecord;
  resolvedArgs: Record<string, string>;
  source: SkillSource;
}

export interface InstructionFileRecord {
  content: string;
  filePath: string;
  source: InstructionSource;
}

export interface InstructionIssue {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  filePath?: string;
  source?: InstructionSource;
}

export interface LoadInstructionFilesOptions {
  homeDir?: string;
  includeProject?: boolean;
  includeUserGlobal?: boolean;
  workspaceRoot?: string;
}

export interface LoadInstructionFilesResult {
  files: InstructionFileRecord[];
  issues: InstructionIssue[];
  scannedPaths: string[];
}

export interface ExplicitSkillInvocation {
  effort?: SkillEffortLevel;
  executionContext?: SkillExecutionContext;
  matchedReference: string;
  model?: string;
  remainingQuery?: string;
  skillName: string;
  source: SkillSource;
  sourceLabel?: string;
  sourcePolicy?: SkillSourcePolicy;
  trustLevel: SkillTrustLevel;
  trustNote?: string;
}

export interface RequestedSkillInvocation {
  matchedReference: string;
  remainingQuery?: string;
  source: 'input' | 'slash-command';
}
