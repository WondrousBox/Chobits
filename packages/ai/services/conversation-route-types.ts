import type { Role } from '../types';

export const CONVERSATION_ROUTE_EVENT_TYPES = [
  'user_goal',
  'topic_shift',
  'task_added',
  'task_progress',
  'task_done',
  'open_question',
  'decision',
  'key_clue',
  'user_correction',
  'constraint',
  'preference',
  'blocker',
  'assumption',
  'summary_checkpoint'
] as const;

export type ConversationRouteEventType = (typeof CONVERSATION_ROUTE_EVENT_TYPES)[number];

export type ConversationRouteEventStatus = 'active' | 'resolved' | 'superseded' | 'abandoned';

export type ConversationRouteTaskStatus = 'active' | 'in_progress' | 'resolved' | 'blocked' | 'abandoned';

export interface ConversationRouteMessage {
  content: string;
  createdAt?: number | null;
  role: Extract<Role, 'user' | 'assistant'>;
  seq: number;
}

export interface ConversationRouteTaskBrief {
  eventId: string;
  status: ConversationRouteTaskStatus;
  title: string;
}

export interface ConversationRouteSnapshot {
  activeThreads: string[];
  blockers: string[];
  conversationId: string;
  currentGoal?: string;
  currentTopic?: string;
  decisions: string[];
  keyClues: string[];
  keyConstraints: string[];
  lastProcessedSeq: number;
  nextSuggestedFocus?: string;
  openTasks: ConversationRouteTaskBrief[];
  resolvedTasks: ConversationRouteTaskBrief[];
  summary: string;
  updatedAt: number;
  userCorrections: string[];
  version: number;
  workspaceId?: string | null;
}

export interface ConversationRouteEvent {
  confidence: number;
  content: string;
  conversationId: string;
  createdAt: number;
  evidence?: string | null;
  id: string;
  importance: number;
  metadata?: string | null;
  promotedMemoryNoteId?: string | null;
  relatedEventIds: string[];
  resolvesEventIds: string[];
  seqEnd: number;
  seqStart: number;
  status: ConversationRouteEventStatus;
  supersedesEventIds: string[];
  tags: string[];
  title: string;
  type: ConversationRouteEventType;
  updatedAt: number;
  workspaceId?: string | null;
}

export interface ConversationRouteDeltaEvent {
  confidence?: number;
  content?: string;
  evidence?: string;
  importance?: number;
  relatedEventIds?: string[];
  resolvesEventIds?: string[];
  seqEnd?: number;
  seqStart?: number;
  status?: ConversationRouteEventStatus;
  supersedesEventIds?: string[];
  tags?: string[];
  title?: string;
  type?: ConversationRouteEventType;
}

export interface ConversationRouteSnapshotPatch {
  activeThreads?: string[];
  blockers?: string[];
  currentGoal?: string;
  currentTopic?: string;
  decisions?: string[];
  keyClues?: string[];
  keyConstraints?: string[];
  nextSuggestedFocus?: string;
  summary?: string;
  userCorrections?: string[];
}

export interface ConversationRouteDelta {
  events: ConversationRouteDeltaEvent[];
  snapshotPatch: ConversationRouteSnapshotPatch;
}

export interface ConversationRouteChatFn {
  (prompt: string, signal?: AbortSignal): Promise<string>;
}

