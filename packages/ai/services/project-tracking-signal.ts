import type { ConversationRouteMessage, ConversationRouteSnapshot } from './conversation-route-types';
import { cleanStringList, trimText } from './project-tracking-service';
import type { ProjectSignalDecision, ProjectSignalReason } from './project-tracking-types';

export interface DetectProjectSignalInput {
  conversationId: string;
  messages: ConversationRouteMessage[];
  routeSnapshot?: ConversationRouteSnapshot | null;
  workspaceId?: string | null;
}

const PROJECT_TERMS = ['项目', '计划', '跟进', '推进', '里程碑', '阶段', '目标', '交付', '上线', '发布', '复盘', 'project', 'milestone', 'deadline'];
const TIME_TERMS = ['今天', '明天', '后天', '下周', '本周', '月底', '截止', 'deadline', '日期', '时间点', '开会', '会议', '提醒', '日程'];
const AGREEMENT_TERMS = ['协议', '约定', '确认', '达成', '决定', '合同', '评审', '方案'];
const TASK_TERMS = ['待办', '下一步', '先做', '实现', '完成', '拆分', '安排', '检查', '测试', '修复'];
const EXPLICIT_TERMS = ['作为项目跟进', '创建项目', '项目跟踪', '持续跟进', '后续跟进', '帮我跟进', '记成项目'];

export function detectProjectSignal(input: DetectProjectSignalInput): ProjectSignalDecision {
  const userMessages = input.messages.filter((message) => message.role === 'user' && message.content.trim());
  if (!userMessages.length) return emptyDecision();

  const userText = compact(userMessages.map((message) => message.content).join('\n'), 4000);
  const latest = userMessages[userMessages.length - 1];
  const route = input.routeSnapshot;

  const reasons: ProjectSignalReason[] = [];
  let score = 0;

  if (matchesAny(userText, EXPLICIT_TERMS)) {
    score += 0.42;
    reasons.push('explicit_project_tracking_request');
  }
  if (countMatches(userText, PROJECT_TERMS) >= 2 || route?.currentGoal) {
    score += 0.18;
    reasons.push('recurring_goal');
  }
  if (countMatches(userText, TASK_TERMS) >= 2 || (route?.openTasks?.length ?? 0) >= 2) {
    score += 0.16;
    reasons.push('multi_step_plan');
  }
  if (matchesAny(userText, TIME_TERMS)) {
    score += 0.14;
    reasons.push('deadline_or_meeting');
  }
  if (matchesAny(userText, AGREEMENT_TERMS)) {
    score += 0.1;
    reasons.push('agreement_or_decision');
  }

  const uniqueReasons = cleanStringList(reasons, 8) as ProjectSignalReason[];
  const signalScore = clamp(score);
  if (signalScore < 0.5) return { ...emptyDecision(), reasons: uniqueReasons, signalScore };

  const projectName = inferProjectName(userText, route);
  const proposedGoal = inferProjectGoal(userText, route);
  const evidenceSummary = trimText(route?.summary || latest.content.replace(/\s+/g, ' ').trim(), 240);

  return {
    candidate: {
      evidenceMessageIds: userMessages.map((message) => String(message.seq)),
      evidenceSummary,
      proposedGoal,
      proposedName: projectName,
      suggestedMilestones: inferMilestones(userText),
      suggestedReminders: []
    },
    needsUserConfirmation: true,
    reasons: uniqueReasons,
    shouldCreateCandidate: signalScore >= 0.5,
    shouldLinkExistingProject: false,
    signalScore
  };
}

function emptyDecision(): ProjectSignalDecision {
  return {
    needsUserConfirmation: false,
    reasons: [],
    shouldCreateCandidate: false,
    shouldLinkExistingProject: false,
    signalScore: 0
  };
}

function inferProjectName(text: string, route?: ConversationRouteSnapshot | null): string {
  const routeGoal = route?.currentGoal || route?.currentTopic;
  if (routeGoal) return normalizeName(routeGoal);

  const patterns = [/(?:做|实现|设计|开发|推进|跟进|完成)(?:一个|这个|一下)?([^，。！？\n]{4,32})(?:项目|系统|功能|计划|方案|文档)?/, /([^，。！？\n]{4,32})(?:项目|系统|功能|计划|方案|文档)/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeName(match[1]);
  }
  return '未命名项目';
}

function inferProjectGoal(text: string, route?: ConversationRouteSnapshot | null): string {
  const goal = route?.currentGoal || route?.summary || text;
  return trimText(goal.replace(/\s+/g, ' ').trim(), 180);
}

function inferMilestones(text: string): Array<{ title: string; confidence: number }> {
  const milestones: Array<{ title: string; confidence: number }> = [];
  if (matchesAny(text, ['文档', '规划', '设计'])) milestones.push({ confidence: 0.58, title: '完成规划与设计文档' });
  if (matchesAny(text, ['实现', '开发', '代码'])) milestones.push({ confidence: 0.56, title: '完成核心实现' });
  if (matchesAny(text, ['测试', '验证', '检查'])) milestones.push({ confidence: 0.54, title: '完成测试与验证' });
  return milestones.slice(0, 3);
}

function normalizeName(value: string): string {
  return (
    trimText(
      value
        .replace(/^[，。！？\s:：]+/, '')
        .replace(/[，。！？\n].*$/, '')
        .trim(),
      32
    ) || '未命名项目'
  );
}

function compact(value: string, maxLength: number): string {
  return trimText(value.replace(/\s+/g, ' ').trim(), maxLength);
}

function matchesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function countMatches(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term.toLowerCase()) ? 1 : 0), 0);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
