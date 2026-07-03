import type { ConversationRouteMessage, ConversationRouteSnapshot } from './conversation-route-types';
import { cleanStringList, trimText } from './project-tracking-service';
import type { ProjectMatchResult, ProjectSignalReason, ProjectSnapshot, TrackedProject } from './project-tracking-types';

export interface MatchProjectsInput {
  messages?: ConversationRouteMessage[];
  projects: Array<{
    project: TrackedProject;
    snapshot?: ProjectSnapshot | null;
  }>;
  routeSnapshot?: ConversationRouteSnapshot | null;
  text?: string;
}

const EXPLICIT_REFERENCE_TERMS = ['继续', '接着', '上次', '之前', '那个项目', '这个项目', '项目进展', '下一步', '当前项目', '跟进项目', 'project'];
const WEAK_CONTEXT_TERMS = ['目标', '待办', '里程碑', '计划', '会议', '协议', '决策', '阻塞', '风险', '交付', '上线', '复盘'];

export function matchProjectsForConversation(input: MatchProjectsInput): ProjectMatchResult[] {
  const text = normalizeText(
    input.text ||
      [
        ...(input.messages || []).filter((message) => message.role === 'user').map((message) => message.content),
        input.routeSnapshot?.currentGoal,
        input.routeSnapshot?.currentTopic,
        input.routeSnapshot?.summary
      ]
        .filter(Boolean)
        .join('\n')
  );
  if (!text) return [];

  const explicitContinuation = containsAny(text, EXPLICIT_REFERENCE_TERMS);
  const results = input.projects
    .filter(({ project }) => project.status === 'active' || project.status === 'paused')
    .map(({ project, snapshot }) => scoreProject(project, snapshot, text, explicitContinuation))
    .filter((result) => result.score >= 0.35)
    .sort((a, b) => b.score - a.score);

  const top = results[0];
  const second = results[1];
  if (top) {
    const separated = !second || top.score - second.score >= 0.18;
    top.shouldAutoLink = top.score >= 0.82 && separated;
    top.shouldAskUser = !top.shouldAutoLink && top.score >= 0.55;
  }
  for (const result of results.slice(1)) {
    result.shouldAutoLink = false;
    result.shouldAskUser = result.score >= 0.58;
  }
  return results.slice(0, 5);
}

function scoreProject(project: TrackedProject, snapshot: ProjectSnapshot | null | undefined, text: string, explicitContinuation: boolean): ProjectMatchResult {
  const matchedTerms: string[] = [];
  const reasons: ProjectSignalReason[] = [];
  let score = 0;

  const names = cleanStringList([project.name, ...project.aliases], 12);
  for (const name of names) {
    if (includesTerm(text, name)) {
      score += name === project.name ? 0.46 : 0.34;
      matchedTerms.push(name);
      reasons.push('active_project_similarity');
    }
  }

  const keywords = extractProjectTerms(project, snapshot);
  let keywordHits = 0;
  for (const term of keywords) {
    if (!includesTerm(text, term)) continue;
    keywordHits += 1;
    matchedTerms.push(term);
  }
  if (keywordHits > 0) {
    score += Math.min(0.28, keywordHits * 0.06);
    reasons.push('active_project_similarity');
  }

  if (explicitContinuation && (keywordHits > 0 || containsAny(text, WEAK_CONTEXT_TERMS))) {
    score += 0.18;
    reasons.push('cross_conversation_reference');
  }

  if (snapshot?.openTasks?.some((task) => includesTerm(text, task.title))) {
    score += 0.16;
    reasons.push('multi_step_plan');
  }
  if (snapshot?.upcomingDates?.some((date) => includesTerm(text, date.title))) {
    score += 0.14;
    reasons.push('deadline_or_meeting');
  }
  if (snapshot?.decisions?.some((decision) => includesTerm(text, decision))) {
    score += 0.1;
    reasons.push('agreement_or_decision');
  }

  return {
    matchedTerms: cleanStringList(matchedTerms, 12),
    projectId: project.id,
    projectName: project.name,
    reasons: cleanStringList(reasons, 8) as ProjectSignalReason[],
    score: clamp(score),
    shouldAskUser: false,
    shouldAutoLink: false
  };
}

function extractProjectTerms(project: TrackedProject, snapshot?: ProjectSnapshot | null): string[] {
  const values = [
    project.goal,
    project.summary,
    project.scope,
    ...project.tags,
    ...project.domains,
    snapshot?.currentFocus,
    snapshot?.summary,
    ...(snapshot?.openTasks || []).map((task) => task.title),
    ...(snapshot?.upcomingDates || []).map((date) => date.title),
    ...(snapshot?.recentProgress || []),
    ...(snapshot?.decisions || []),
    ...(snapshot?.agreements || [])
  ];
  const terms: string[] = [];
  for (const value of values) {
    if (!value) continue;
    terms.push(...splitTerms(value));
  }
  return cleanStringList(terms, 60).filter((term) => term.length >= 2);
}

function splitTerms(value: string): string[] {
  const text = trimText(value.replace(/[，。！？、；：,.!?;:()[\]{}"'`]/g, ' '), 240);
  const rough = text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const cjkChunks = text.match(/[\u4e00-\u9fff]{2,12}/g) || [];
  return [...rough, ...cjkChunks].filter((term) => !WEAK_CONTEXT_TERMS.includes(term));
}

function normalizeText(value: string): string {
  return trimText(value.replace(/\s+/g, ' ').trim().toLowerCase(), 5000);
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => includesTerm(text, term));
}

function includesTerm(text: string, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  return normalized.length >= 2 && text.includes(normalized);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
