import type { ActivityReward, ActivityRewardId, ConversationBonusCondition, ConversationRewards, DimensionDef } from './character-service';
import {
  getActivityRewards as getCharacterActivityRewards,
  getConversationRewards as getCharacterConversationRewards,
  getDimensionSchema as getCharacterDimensionSchema
} from './character-service';
import {
  DEFAULT_CONVERSATION_REWARDS,
  DEFAULT_FAVOR_MODIFIERS,
  DEFAULT_MOOD_RULES,
  DEFAULT_XP_SOURCES,
  mergeActivityRewards,
  registerConversationBonusMatcher,
  resetConversationBonusMatchers,
  type ConversationBonusMatcher,
  type ConversationRewardContext,
  type PersonaRewardGrant,
  resolveActivityReward,
  resolveConversationEventRules,
  resolveConversationReward,
  resolveConversationRewardBonus,
  unregisterConversationBonusMatcher
} from './config/persona-rules';
import type { FavorModifier, MoodRule, XPSource } from './persona-state';

export type { ConversationBonusMatcher, ConversationRewardContext, PersonaDimensionReward, PersonaRewardGrant } from './config/persona-rules';

export interface PersonaRulesSnapshot {
  conversationRewards: ConversationRewards;
  activityRewards: Record<ActivityRewardId, ActivityReward>;
  dimensionSchema: DimensionDef[];
  xpSources: XPSource[];
  favorModifiers: FavorModifier[];
  moodRules: MoodRule[];
}

export interface PersonaRulesLayer {
  conversationRewards?: Partial<ConversationRewards> | null;
  activityRewards?: Partial<Record<ActivityRewardId, ActivityReward>> | null;
  dimensionSchema?: DimensionDef[] | null;
  xpSources?: XPSource[] | null;
  favorModifiers?: FavorModifier[] | null;
  moodRules?: MoodRule[] | null;
}

export interface PersonaRulesProvider {
  getSnapshot(): Partial<PersonaRulesSnapshot> | PersonaRulesSnapshot | null | undefined;
}

type PersonaRulesChangeListener = (snapshot: PersonaRulesSnapshot) => void;

function cloneConversationBonusConditions(conditions: ConversationBonusCondition[] | null | undefined): ConversationBonusCondition[] {
  return (conditions ?? []).map((condition) => ({ ...condition }));
}

function cloneConversationRewards(rewards: Partial<ConversationRewards> | ConversationRewards | null | undefined): ConversationRewards {
  return {
    xpPerConversation: rewards?.xpPerConversation ?? DEFAULT_CONVERSATION_REWARDS.xpPerConversation,
    favorPerConversation: rewards?.favorPerConversation ?? DEFAULT_CONVERSATION_REWARDS.favorPerConversation,
    cooldownMs: rewards?.cooldownMs ?? DEFAULT_CONVERSATION_REWARDS.cooldownMs,
    bonusConditions: cloneConversationBonusConditions(rewards?.bonusConditions)
  };
}

function clonePartialConversationRewards(rewards: Partial<ConversationRewards> | null | undefined): Partial<ConversationRewards> | undefined {
  if (!rewards) {
    return undefined;
  }

  return {
    ...(rewards.xpPerConversation !== undefined ? { xpPerConversation: rewards.xpPerConversation } : {}),
    ...(rewards.favorPerConversation !== undefined ? { favorPerConversation: rewards.favorPerConversation } : {}),
    ...(rewards.cooldownMs !== undefined ? { cooldownMs: rewards.cooldownMs } : {}),
    ...(rewards.bonusConditions !== undefined ? { bonusConditions: cloneConversationBonusConditions(rewards.bonusConditions) } : {})
  };
}

function cloneActivityRewards(rewards: Partial<Record<ActivityRewardId, ActivityReward>> | Record<ActivityRewardId, ActivityReward> | null | undefined): Record<ActivityRewardId, ActivityReward> {
  const cloned = {} as Record<ActivityRewardId, ActivityReward>;

  for (const activityId of Object.keys(rewards ?? {}) as ActivityRewardId[]) {
    const reward = rewards?.[activityId];
    if (!reward) continue;
    cloned[activityId] = {
      xp: reward.xp,
      favor: reward.favor,
      dimensionGrowth: reward.dimensionGrowth ? { ...reward.dimensionGrowth } : undefined
    };
  }

  return cloned;
}

function mergeActivityRewardEntries(
  base: Partial<Record<ActivityRewardId, ActivityReward>> | Record<ActivityRewardId, ActivityReward>,
  patch?: Partial<Record<ActivityRewardId, ActivityReward>> | null
): Record<ActivityRewardId, ActivityReward> {
  const merged = cloneActivityRewards(base);

  for (const activityId of Object.keys(patch ?? {}) as ActivityRewardId[]) {
    const reward = patch?.[activityId];
    if (!reward) continue;

    const existing = merged[activityId];
    const mergedDimensionGrowth = {
      ...(existing?.dimensionGrowth ?? {}),
      ...(reward.dimensionGrowth ?? {})
    };

    merged[activityId] = {
      ...(existing ?? { xp: 0, favor: 0 }),
      ...reward,
      dimensionGrowth: Object.keys(mergedDimensionGrowth).length > 0 ? mergedDimensionGrowth : undefined
    };
  }

  return merged;
}

function cloneDimensionSchema(schema: DimensionDef[] | null | undefined): DimensionDef[] {
  return (schema ?? []).map((dimension) => ({
    ...dimension,
    growthSources: [...dimension.growthSources]
  }));
}

function cloneXPSources(sources: XPSource[] | null | undefined): XPSource[] {
  return (sources ?? []).map((source) => ({ ...source }));
}

function cloneFavorModifiers(modifiers: FavorModifier[] | null | undefined): FavorModifier[] {
  return (modifiers ?? []).map((modifier) => ({ ...modifier }));
}

function cloneMoodRules(rules: MoodRule[] | null | undefined): MoodRule[] {
  return (rules ?? []).map((rule) => ({ ...rule }));
}

function mergeConversationRewards(base: ConversationRewards, patch?: Partial<ConversationRewards> | null): ConversationRewards {
  if (!patch) {
    return cloneConversationRewards(base);
  }

  const bonusConditions = new Map<string, ConversationBonusCondition>();
  for (const condition of base.bonusConditions) {
    bonusConditions.set(condition.id, { ...condition });
  }
  for (const condition of patch.bonusConditions ?? []) {
    bonusConditions.set(condition.id, { ...condition });
  }

  return {
    xpPerConversation: patch.xpPerConversation ?? base.xpPerConversation,
    favorPerConversation: patch.favorPerConversation ?? base.favorPerConversation,
    cooldownMs: patch.cooldownMs ?? base.cooldownMs,
    bonusConditions: Array.from(bonusConditions.values())
  };
}

function mergeRuleEntriesById<T extends { id: string }>(base: T[], patch?: T[] | null): T[] {
  const merged = new Map<string, T>();

  for (const entry of base) {
    merged.set(entry.id, { ...entry });
  }
  for (const entry of patch ?? []) {
    merged.set(entry.id, { ...entry });
  }

  return Array.from(merged.values());
}

function mergeDimensionSchemaEntries(base: DimensionDef[], patch?: DimensionDef[] | null): DimensionDef[] {
  const merged = new Map<string, DimensionDef>();

  for (const dimension of base) {
    merged.set(dimension.id, {
      ...dimension,
      growthSources: [...dimension.growthSources]
    });
  }

  for (const dimension of patch ?? []) {
    const existing = merged.get(dimension.id);
    merged.set(dimension.id, {
      ...(existing ?? {}),
      ...dimension,
      growthSources: Array.from(new Set([...(existing?.growthSources ?? []), ...dimension.growthSources]))
    });
  }

  return Array.from(merged.values());
}

function upsertConversationDerivedRules(snapshot: PersonaRulesSnapshot): PersonaRulesSnapshot {
  const { xpSource, favorModifier } = resolveConversationEventRules(snapshot.conversationRewards);

  return {
    ...snapshot,
    xpSources: mergeRuleEntriesById(snapshot.xpSources, [xpSource]),
    favorModifiers: mergeRuleEntriesById(snapshot.favorModifiers, [favorModifier])
  };
}

function normalizePersonaRulesSnapshot(snapshot?: Partial<PersonaRulesSnapshot> | null): PersonaRulesSnapshot {
  return upsertConversationDerivedRules({
    conversationRewards: cloneConversationRewards(snapshot?.conversationRewards),
    activityRewards: snapshot?.activityRewards ? cloneActivityRewards(snapshot.activityRewards) : mergeActivityRewards(),
    dimensionSchema: cloneDimensionSchema(snapshot?.dimensionSchema),
    xpSources: mergeRuleEntriesById(cloneXPSources(DEFAULT_XP_SOURCES), snapshot?.xpSources ? cloneXPSources(snapshot.xpSources) : undefined),
    favorModifiers: mergeRuleEntriesById(cloneFavorModifiers(DEFAULT_FAVOR_MODIFIERS), snapshot?.favorModifiers ? cloneFavorModifiers(snapshot.favorModifiers) : undefined),
    moodRules: mergeRuleEntriesById(cloneMoodRules(DEFAULT_MOOD_RULES), snapshot?.moodRules ? cloneMoodRules(snapshot.moodRules) : undefined)
  });
}

function applyPersonaRulesLayer(snapshot: PersonaRulesSnapshot, layer: PersonaRulesLayer): PersonaRulesSnapshot {
  return upsertConversationDerivedRules({
    conversationRewards: mergeConversationRewards(snapshot.conversationRewards, layer.conversationRewards),
    activityRewards: mergeActivityRewardEntries(snapshot.activityRewards, layer.activityRewards),
    dimensionSchema: mergeDimensionSchemaEntries(snapshot.dimensionSchema, layer.dimensionSchema),
    xpSources: mergeRuleEntriesById(snapshot.xpSources, layer.xpSources ? cloneXPSources(layer.xpSources) : undefined),
    favorModifiers: mergeRuleEntriesById(snapshot.favorModifiers, layer.favorModifiers ? cloneFavorModifiers(layer.favorModifiers) : undefined),
    moodRules: mergeRuleEntriesById(snapshot.moodRules, layer.moodRules ? cloneMoodRules(layer.moodRules) : undefined)
  });
}

function clonePersonaRulesLayer(layer: PersonaRulesLayer): PersonaRulesLayer {
  return {
    conversationRewards: clonePartialConversationRewards(layer.conversationRewards),
    activityRewards: layer.activityRewards ? cloneActivityRewards(layer.activityRewards) : undefined,
    dimensionSchema: layer.dimensionSchema ? cloneDimensionSchema(layer.dimensionSchema) : undefined,
    xpSources: layer.xpSources ? cloneXPSources(layer.xpSources) : undefined,
    favorModifiers: layer.favorModifiers ? cloneFavorModifiers(layer.favorModifiers) : undefined,
    moodRules: layer.moodRules ? cloneMoodRules(layer.moodRules) : undefined
  };
}

const defaultPersonaRulesProvider: PersonaRulesProvider = {
  getSnapshot(): Partial<PersonaRulesSnapshot> {
    return {
      conversationRewards: getCharacterConversationRewards(),
      activityRewards: getCharacterActivityRewards(),
      dimensionSchema: getCharacterDimensionSchema()
    };
  }
};

let personaRulesProvider: PersonaRulesProvider = defaultPersonaRulesProvider;
const personaRulesLayers = new Map<string, PersonaRulesLayer>();
const personaRulesChangeListeners = new Set<PersonaRulesChangeListener>();

function emitPersonaRulesChanged(): void {
  if (personaRulesChangeListeners.size === 0) {
    return;
  }

  const snapshot = getPersonaRulesSnapshot();
  for (const listener of personaRulesChangeListeners) {
    listener(snapshot);
  }
}

export function getPersonaRulesProvider(): PersonaRulesProvider {
  return personaRulesProvider;
}

export function setPersonaRulesProvider(provider: PersonaRulesProvider | null): void {
  personaRulesProvider = provider ?? defaultPersonaRulesProvider;
  emitPersonaRulesChanged();
}

export function resetPersonaRulesProvider(): void {
  personaRulesProvider = defaultPersonaRulesProvider;
  emitPersonaRulesChanged();
}

export function upsertPersonaRulesLayer(id: string, layer: PersonaRulesLayer): void {
  const normalizedId = id.trim();
  if (!normalizedId) {
    throw new Error('[persona-rules] layer id is required');
  }
  personaRulesLayers.set(normalizedId, clonePersonaRulesLayer(layer));
  emitPersonaRulesChanged();
}

export function removePersonaRulesLayer(id: string): void {
  if (personaRulesLayers.delete(id)) {
    emitPersonaRulesChanged();
  }
}

export function clearPersonaRulesLayers(): void {
  if (personaRulesLayers.size === 0) {
    return;
  }
  personaRulesLayers.clear();
  emitPersonaRulesChanged();
}

export function subscribePersonaRulesChanges(listener: PersonaRulesChangeListener): () => void {
  personaRulesChangeListeners.add(listener);
  return () => {
    personaRulesChangeListeners.delete(listener);
  };
}

export function resetPersonaRulesRuntime(): void {
  personaRulesProvider = defaultPersonaRulesProvider;
  personaRulesLayers.clear();
  resetConversationBonusMatchers();
  emitPersonaRulesChanged();
}

export { registerConversationBonusMatcher, unregisterConversationBonusMatcher };

export function getPersonaRulesSnapshot(): PersonaRulesSnapshot {
  let snapshot = normalizePersonaRulesSnapshot(personaRulesProvider.getSnapshot());
  for (const layer of personaRulesLayers.values()) {
    snapshot = applyPersonaRulesLayer(snapshot, layer);
  }
  return normalizePersonaRulesSnapshot(snapshot);
}

export function getPersonaRuleDimensionSchema(snapshot?: PersonaRulesSnapshot): DimensionDef[] {
  return cloneDimensionSchema((snapshot ?? getPersonaRulesSnapshot()).dimensionSchema);
}

export function getConversationRewardCooldownMs(snapshot?: PersonaRulesSnapshot): number {
  return (snapshot ?? getPersonaRulesSnapshot()).conversationRewards.cooldownMs;
}

export function getConversationRewardEventRules(snapshot?: PersonaRulesSnapshot): ReturnType<typeof resolveConversationEventRules> {
  return resolveConversationEventRules((snapshot ?? getPersonaRulesSnapshot()).conversationRewards);
}

export function getResolvedConversationPersonaReward(context?: ConversationRewardContext, snapshot?: PersonaRulesSnapshot): PersonaRewardGrant {
  const rulesSnapshot = snapshot ?? getPersonaRulesSnapshot();
  return resolveConversationReward({
    rewards: rulesSnapshot.conversationRewards,
    dimensionSchema: rulesSnapshot.dimensionSchema,
    context
  });
}

export function getResolvedConversationPersonaRewardBonus(context?: ConversationRewardContext, snapshot?: PersonaRulesSnapshot): PersonaRewardGrant {
  const rulesSnapshot = snapshot ?? getPersonaRulesSnapshot();
  return resolveConversationRewardBonus({
    rewards: rulesSnapshot.conversationRewards,
    dimensionSchema: rulesSnapshot.dimensionSchema,
    context
  });
}

export function getResolvedActivityPersonaReward(activityId: ActivityRewardId, snapshot?: PersonaRulesSnapshot): PersonaRewardGrant {
  const rulesSnapshot = snapshot ?? getPersonaRulesSnapshot();
  return resolveActivityReward({
    activityId,
    rewards: rulesSnapshot.activityRewards,
    dimensionSchema: rulesSnapshot.dimensionSchema
  });
}
