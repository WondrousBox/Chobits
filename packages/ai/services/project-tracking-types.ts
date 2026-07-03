export const PROJECT_STATUSES = ['candidate', 'active', 'paused', 'completed', 'archived', 'rejected'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_MEMORY_PROMOTION_STATUSES = ['none', 'suggested', 'promoted', 'declined'] as const;
export type ProjectMemoryPromotionStatus = (typeof PROJECT_MEMORY_PROMOTION_STATUSES)[number];

export const PROJECT_CREATED_BY_VALUES = ['user', 'agent_suggestion', 'import'] as const;
export type ProjectCreatedBy = (typeof PROJECT_CREATED_BY_VALUES)[number];

export const PROJECT_LINK_TARGET_TYPES = ['conversation', 'conversation_route_event', 'memory_note', 'resource', 'scheduler_task', 'file', 'external_url'] as const;
export type ProjectLinkTargetType = (typeof PROJECT_LINK_TARGET_TYPES)[number];

export const PROJECT_LINK_RELATION_TYPES = ['source', 'evidence', 'follow_up', 'decision_record', 'deliverable', 'meeting', 'reminder', 'related_context'] as const;
export type ProjectLinkRelationType = (typeof PROJECT_LINK_RELATION_TYPES)[number];

export const PROJECT_CANDIDATE_STATUSES = ['pending', 'confirmed', 'dismissed', 'expired', 'merged'] as const;
export type ProjectCandidateStatus = (typeof PROJECT_CANDIDATE_STATUSES)[number];

export const PROJECT_SIGNAL_REASONS = [
  'explicit_project_tracking_request',
  'recurring_goal',
  'multi_step_plan',
  'deadline_or_meeting',
  'external_stakeholder',
  'agreement_or_decision',
  'cross_conversation_reference',
  'active_project_similarity'
] as const;
export type ProjectSignalReason = (typeof PROJECT_SIGNAL_REASONS)[number];

export const PROJECT_DATE_KINDS = ['deadline', 'meeting', 'follow_up', 'milestone', 'review'] as const;
export type ProjectDateKind = (typeof PROJECT_DATE_KINDS)[number];

export const PROJECT_DATE_STATUSES = ['upcoming', 'due', 'missed', 'done'] as const;
export type ProjectDateStatus = (typeof PROJECT_DATE_STATUSES)[number];

export const PROJECT_TASK_STATUSES = ['active', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number];

export const PROJECT_REMINDER_KINDS = ['deadline', 'meeting', 'follow_up', 'review', 'milestone_check', 'stale_project_check'] as const;
export type ProjectReminderKind = (typeof PROJECT_REMINDER_KINDS)[number];

export const PROJECT_REMINDER_SYNC_STATUSES = ['suggested', 'synced', 'cancelled', 'failed'] as const;
export type ProjectReminderSyncStatus = (typeof PROJECT_REMINDER_SYNC_STATUSES)[number];

export const PROJECT_EVENT_TYPES = [
  'goal_defined',
  'scope_defined',
  'task_added',
  'task_progress',
  'task_done',
  'milestone_added',
  'milestone_reached',
  'deadline_changed',
  'meeting_scheduled',
  'meeting_done',
  'agreement_reached',
  'decision_made',
  'plan_changed',
  'blocker_found',
  'blocker_resolved',
  'risk_identified',
  'reminder_scheduled',
  'status_changed',
  'summary_checkpoint'
] as const;
export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];

export const PROJECT_EVENT_STATUSES = ['active', 'resolved', 'superseded', 'cancelled'] as const;
export type ProjectEventStatus = (typeof PROJECT_EVENT_STATUSES)[number];

export const PROJECT_EVENT_QUALITIES = ['draft', 'accepted', 'rejected'] as const;
export type ProjectEventQuality = (typeof PROJECT_EVENT_QUALITIES)[number];

export const PROJECT_EVENT_REVIEWED_BY_VALUES = ['user', 'agent', 'system'] as const;
export type ProjectEventReviewedBy = (typeof PROJECT_EVENT_REVIEWED_BY_VALUES)[number];

export const PROJECT_AUDIT_ACTORS = ['user', 'agent', 'system'] as const;
export type ProjectAuditActor = (typeof PROJECT_AUDIT_ACTORS)[number];

export const PROJECT_MILESTONE_STATUSES = ['planned', 'in_progress', 'done', 'missed', 'cancelled'] as const;
export type ProjectMilestoneStatus = (typeof PROJECT_MILESTONE_STATUSES)[number];

export interface ProjectStakeholder {
  id?: string;
  name: string;
  notes?: string;
  relation?: 'owner' | 'collaborator' | 'client' | 'reviewer' | 'external' | 'other';
  role?: string;
}

export interface ProjectMilestoneDraft {
  confidence?: number;
  description?: string;
  targetAt?: number | string;
  title: string;
}

export interface ProjectReminderDraft {
  dueAt?: number | string;
  kind: ProjectReminderKind;
  needsConfirmation: boolean;
  reason: string;
  sourceEventId?: string;
  title: string;
}

export interface ProjectReminderSuggestion extends ProjectReminderDraft {
  confidence?: number;
  projectId: string;
  sourceType?: 'event' | 'milestone' | 'snapshot';
}

export interface ProjectPrivacySettings {
  allowAutoLinking: boolean;
  allowLongTermMemoryPromotion: boolean;
  allowPromptInjection: boolean;
  allowReminderSuggestions: boolean;
  sensitive: boolean;
}

export interface ProjectDateBrief {
  at: number;
  kind: ProjectDateKind;
  status: ProjectDateStatus;
  title: string;
}

export interface ProjectTaskBrief {
  dueAt?: number;
  eventId: string;
  status: ProjectTaskStatus;
  title: string;
}

export interface TrackedProject {
  aliases: string[];
  archivedAt?: number | null;
  completedAt?: number | null;
  confidence: number;
  createdAt: number;
  createdBy: ProjectCreatedBy;
  deletedAt?: number | null;
  domains: string[];
  goal: string;
  id: string;
  completionSummary?: string | null;
  memoryPromotionStatus: ProjectMemoryPromotionStatus;
  mergedIntoProjectId?: string | null;
  metadata?: string | null;
  name: string;
  ownerUserId?: string | null;
  privacySettings: ProjectPrivacySettings;
  promotedMemoryNoteId?: string | null;
  retrospective?: string | null;
  scope?: string | null;
  splitFromProjectId?: string | null;
  startedAt?: number | null;
  status: ProjectStatus;
  stakeholders: ProjectStakeholder[];
  summary: string;
  tags: string[];
  targetEndAt?: number | null;
  updatedAt: number;
  workspaceId: string;
}

export interface ProjectCandidate {
  confirmedProjectId?: string | null;
  conversationId: string;
  createdAt: number;
  evidenceMessageIds: string[];
  evidenceSummary: string;
  expiresAt: number;
  id: string;
  proposedGoal: string;
  proposedName: string;
  reasons: ProjectSignalReason[];
  seqEnd: number;
  seqStart: number;
  signalScore: number;
  status: ProjectCandidateStatus;
  suggestedMilestones: ProjectMilestoneDraft[];
  suggestedReminders: ProjectReminderDraft[];
  updatedAt: number;
  workspaceId: string;
}

export interface ProjectSnapshot {
  agreements: string[];
  blockers: string[];
  changes: string[];
  completedMilestones: string[];
  currentFocus?: string;
  decisions: string[];
  goal: string;
  nextSuggestedAction?: string;
  openTasks: ProjectTaskBrief[];
  projectId: string;
  recentProgress: string[];
  risks: string[];
  status: ProjectStatus;
  summary: string;
  upcomingDates: ProjectDateBrief[];
  updatedAt: number;
  version: number;
  workspaceId: string;
}

export interface ProjectLink {
  confidence: number;
  createdAt: number;
  createdBy: 'user' | 'agent' | 'system';
  id: string;
  projectId: string;
  relationType: ProjectLinkRelationType;
  strength: number;
  targetId: string;
  targetType: ProjectLinkTargetType;
  workspaceId: string;
}

export interface ProjectEvent {
  confidence: number;
  content: string;
  createdAt: number;
  dueAt?: number | null;
  eventTime?: number | null;
  id: string;
  importance: number;
  metadata?: string | null;
  needsUserConfirmation: boolean;
  projectId: string;
  quality: ProjectEventQuality;
  relatedEventIds: string[];
  reviewedAt?: number | null;
  reviewedBy?: ProjectEventReviewedBy | null;
  sourceConversationId?: string | null;
  sourceMemoryNoteIds: string[];
  sourceRouteEventIds: string[];
  sourceSeqEnd?: number | null;
  sourceSeqStart?: number | null;
  status: ProjectEventStatus;
  supersedesEventIds: string[];
  title: string;
  type: ProjectEventType;
  updatedAt: number;
  workspaceId: string;
}

export interface ProjectMilestone {
  completedAt?: number | null;
  createdAt: number;
  description?: string | null;
  evidenceEventIds: string[];
  id: string;
  projectId: string;
  status: ProjectMilestoneStatus;
  targetAt?: number | null;
  title: string;
  updatedAt: number;
  workspaceId: string;
}

export interface ProjectReminderLink {
  createdAt: number;
  dueAt?: number | null;
  id: string;
  kind: ProjectReminderKind;
  lastSyncedAt?: number | null;
  metadata?: string | null;
  projectEventId?: string | null;
  projectId: string;
  reason?: string | null;
  schedulerTaskId: string;
  status: 'suggested' | 'scheduled' | 'done' | 'cancelled';
  syncStatus: ProjectReminderSyncStatus;
  title?: string | null;
  workspaceId: string;
}

export interface ProjectImpactPreview {
  auditLogs: number;
  events: number;
  links: number;
  milestones: number;
  projectId: string;
  promotedMemoryNoteIds: string[];
  reminderLinks: number;
  schedulerTasks: number;
  warnings: string[];
}

export interface ProjectOrphanReport {
  deletedProjectActiveLinks: ProjectLink[];
  danglingMemoryLinks: ProjectLink[];
  missingSchedulerTasks: ProjectReminderLink[];
  projectId: string;
  staleSchedulerTasks: ProjectReminderLink[];
  warnings: string[];
}

export interface ProjectAuditLog {
  action: string;
  actor: ProjectAuditActor;
  after?: string | null;
  before?: string | null;
  createdAt: number;
  id: string;
  metadata?: string | null;
  projectId?: string | null;
  reason?: string | null;
  targetId?: string | null;
  targetType: string;
  workspaceId: string;
}

export interface ExportedProjectData {
  auditLogs: ProjectAuditLog[];
  events: ProjectEvent[];
  links: ProjectLink[];
  milestones: ProjectMilestone[];
  project: TrackedProject;
  reminderLinks: ProjectReminderLink[];
  snapshot: ProjectSnapshot | null;
}

export interface ProjectEventDraft {
  confidence?: number;
  content: string;
  dueAt?: number | null;
  eventTime?: number | null;
  importance?: number;
  metadata?: string | null;
  needsUserConfirmation?: boolean;
  relatedEventIds?: string[];
  quality?: ProjectEventQuality;
  reviewedAt?: number | null;
  reviewedBy?: ProjectEventReviewedBy | null;
  sourceConversationId?: string | null;
  sourceMemoryNoteIds?: string[];
  sourceRouteEventIds?: string[];
  sourceSeqEnd?: number | null;
  sourceSeqStart?: number | null;
  status?: ProjectEventStatus;
  supersedesEventIds?: string[];
  title: string;
  type: ProjectEventType;
}

export interface ProjectMilestonePatch {
  description?: string | null;
  evidenceEventIds?: string[];
  status?: ProjectMilestoneStatus;
  targetAt?: number | null;
  title: string;
}

export interface ProjectDelta {
  events: ProjectEventDraft[];
  milestonePatches: ProjectMilestonePatch[];
}

export interface ProjectMatchResult {
  matchedTerms: string[];
  projectId: string;
  projectName: string;
  reasons: ProjectSignalReason[];
  score: number;
  shouldAskUser: boolean;
  shouldAutoLink: boolean;
}

export interface ProjectTrackingConfig {
  autoDetectEnabled: boolean;
  autoLinkEnabled: boolean;
  candidateCooldownMinutes: number;
  enabled: boolean;
  llmProjectDelta?: {
    enabled: boolean;
    maxTokens?: number;
    minMessageChars?: number;
    minMessages?: number;
    model?: string;
    providerId?: string;
    providerPresetId?: string;
    temperature?: number;
  };
  promptInjectionEnabled: boolean;
  reminderSuggestionEnabled: boolean;
}

export interface ProjectSignalDecision {
  candidate?: {
    evidenceMessageIds: string[];
    evidenceSummary: string;
    proposedGoal: string;
    proposedName: string;
    suggestedMilestones: ProjectMilestoneDraft[];
    suggestedReminders: ProjectReminderDraft[];
  };
  linkProjectId?: string;
  needsUserConfirmation: boolean;
  reasons: ProjectSignalReason[];
  shouldCreateCandidate: boolean;
  shouldLinkExistingProject: boolean;
  signalScore: number;
}

export interface CreateProjectInput {
  aliases?: string[];
  createdBy?: ProjectCreatedBy;
  domains?: string[];
  goal: string;
  name: string;
  scope?: string | null;
  status?: ProjectStatus;
  summary?: string;
  tags?: string[];
  workspaceId: string;
}
