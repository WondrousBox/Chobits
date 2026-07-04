import { parseJsonMarkdown } from '../json';
import type { ConversationRouteMessage, ConversationRouteSnapshot } from './conversation-route-types';
import { cleanStringList, trimText } from './project-tracking-service';
import type { ProjectMilestoneDraft, ProjectReminderDraft, ProjectSignalDecision, ProjectSignalReason } from './project-tracking-types';

export interface DetectProjectSignalInput {
  conversationId: string;
  messages: ConversationRouteMessage[];
  routeSnapshot?: ConversationRouteSnapshot | null;
  workspaceId?: string | null;
}

export interface ProjectSignalDiagnostics {
  latestUserPreview: string;
  matchedAgreementTerms: string[];
  matchedExplicitPatterns: string[];
  matchedExplicitTerms: string[];
  matchedProjectTerms: string[];
  matchedTaskTerms: string[];
  matchedTimeTerms: string[];
  routeHasCurrentGoal: boolean;
  routeOpenTaskCount: number;
  userChars: number;
  userMessageCount: number;
}

export interface ProjectSignalChatFn {
  (prompt: string, signal?: AbortSignal): Promise<string>;
}

export interface ProjectSignalChatFnFactory {
  (): Promise<ProjectSignalChatFn | undefined>;
}

export type ProjectSignalDetectionSource = 'llm' | 'rules' | 'rules_fallback';

export interface ProjectSignalDetectionResult {
  decision: ProjectSignalDecision;
  error?: string;
  source: ProjectSignalDetectionSource;
}

const PROJECT_TERMS = ['项目', '计划', '跟进', '推进', '里程碑', '阶段', '目标', '交付', '上线', '发布', '复盘', 'project', 'milestone', 'deadline'];
const TIME_TERMS = ['今天', '明天', '后天', '周末', '本周末', '下周', '本周', '月底', '截止', 'deadline', '日期', '时间点', '时间安排', '开会', '会议', '提醒', '日程'];
const AGREEMENT_TERMS = ['协议', '约定', '确认', '达成', '决定', '合同', '评审', '方案'];
const TASK_TERMS = ['待办', '下一步', '先做', '实现', '完成', '拆分', '安排', '检查', '测试', '修复', '制定', '行程', '清单'];
const PLAN_REQUEST_TERMS = ['制定一个计划', '制定计划', '做个计划', '做一个计划', '安排一下', '安排行程', '规划一下', '列一下', '列清单', '准备清单', '时间安排'];
const EXPLICIT_TERMS = ['作为项目跟进', '创建项目', '项目跟踪', '项目追踪', '持续跟进', '后续跟进', '帮我跟进', '帮忙跟进', '记成项目', '记为项目'];
const EXPLICIT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'create_project_phrase', pattern: /(创建|新建|建立|建一个|建个|建|开一个|开个|开启|设为|设成|记为|记成|转成|作为|纳入|加入|做成).{0,8}(项目|project)/i },
  { label: 'project_tracking_phrase', pattern: /(项目|project).{0,8}(跟踪|追踪|跟进|tracking|track)/i },
  { label: 'track_this_phrase', pattern: /(持续|长期|后续)?\s*(跟踪|追踪|跟进).{0,8}(这件事|这个|它|本事项|project|项目)/i },
  { label: 'start_project_tracking_phrase', pattern: /(开启|打开|启用).{0,8}(项目|project).{0,8}(跟踪|追踪|tracking)/i },
  { label: 'track_this_project_en', pattern: /(track|tracking|follow up).{0,16}(this|the)?\s*(project|work|task)/i },
  { label: 'establish_project_phrase', pattern: /立项|立个项/ }
];
const CANDIDATE_THRESHOLD = 0.5;

const PROJECT_SIGNAL_LLM_PROMPT = `你是 Project Tracking Memory 的项目候选识别器。你的任务是判断当前对话是否值得创建一个“跨会话项目候选”，等待用户确认。

项目候选的定义：
- 有持续目标、执行过程、交付物、截止时间、待办、决策、风险、会议、里程碑，后续值得跨会话追踪
- 或用户明确要求“创建项目 / 作为项目跟进 / 立项 / track this project”
- “项目”不是只指长期工程。短期但真实要执行的计划也可以是项目候选，例如：明天出门旅游、周末搬家、下周开会、一次活动筹备、一次采购/行程/考试/发布安排
- 如果用户要求制定计划、安排行程、拆解步骤，并且有明确时间、地点、现实行动或后续提醒价值，倾向于创建候选，让用户确认

不要创建项目候选：
- 寒暄、闲聊、普通解释、单次问答
- 只是问“什么是项目/项目管理/里程碑”
- 只是 assistant 自己猜测用户有项目，但用户没有确认或展开
- 没有后续追踪价值的临时问题，例如只问天气、概念解释、一次性翻译、随手闲聊

输出规则：
- 只输出 JSON，不要解释
- shouldCreateCandidate=true 时，needsUserConfirmation 必须为 true
- signalScore 0~1；不确定时低于 0.5
- evidenceMessageIds 只能使用用户消息 seq
- proposedName 不超过 32 个汉字，proposedGoal/evidenceSummary 不超过 180 个汉字
- suggestedMilestones 最多 3 个；没有就 []

判断例子：
- 用户：“明天出门旅游，制定一个计划呗” => shouldCreateCandidate=true，signalScore 约 0.65~0.8，原因包含 deadline_or_meeting、multi_step_plan，项目名类似“明日旅游计划”
- 用户：“周末搬家，帮我列一下准备清单和时间安排” => shouldCreateCandidate=true，原因包含 deadline_or_meeting、multi_step_plan
- 用户：“请把这个作为项目跟进，月底上线” => shouldCreateCandidate=true，原因包含 explicit_project_tracking_request
- 用户：“明天天气怎么样” => shouldCreateCandidate=false，因为只是信息查询
- 用户：“你知道什么是项目管理吗” => shouldCreateCandidate=false，因为只是概念解释

JSON 结构：
{
  "shouldCreateCandidate": false,
  "needsUserConfirmation": false,
  "signalScore": 0.2,
  "reasons": ["explicit_project_tracking_request|recurring_goal|multi_step_plan|deadline_or_meeting|external_stakeholder|agreement_or_decision|cross_conversation_reference|active_project_similarity"],
  "candidate": {
    "proposedName": "项目名",
    "proposedGoal": "项目目标",
    "evidenceSummary": "为什么像项目",
    "evidenceMessageIds": ["1"],
    "suggestedMilestones": [{"title":"里程碑","confidence":0.7}],
    "suggestedReminders": []
  }
}`;

export function detectProjectSignal(input: DetectProjectSignalInput): ProjectSignalDecision {
  const userMessages = input.messages.filter((message) => message.role === 'user' && message.content.trim());
  if (!userMessages.length) return emptyDecision();

  const userText = compact(userMessages.map((message) => message.content).join('\n'), 4000);
  const latest = userMessages[userMessages.length - 1];
  const route = input.routeSnapshot;

  const reasons: ProjectSignalReason[] = [];
  let score = 0;

  if (matchesAny(userText, EXPLICIT_TERMS) || matchesAnyPattern(userText, EXPLICIT_PATTERNS)) {
    score += CANDIDATE_THRESHOLD;
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
  if (matchesAny(userText, PLAN_REQUEST_TERMS) && matchesAny(userText, TIME_TERMS)) {
    score += 0.42;
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
  if (signalScore < CANDIDATE_THRESHOLD) return { ...emptyDecision(), reasons: uniqueReasons, signalScore };

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
    shouldCreateCandidate: signalScore >= CANDIDATE_THRESHOLD,
    shouldLinkExistingProject: false,
    signalScore
  };
}

export async function detectProjectSignalWithLlm(input: DetectProjectSignalInput, createChatFn?: ProjectSignalChatFnFactory, signal?: AbortSignal): Promise<ProjectSignalDetectionResult> {
  const ruleDecision = detectProjectSignal(input);
  if (ruleDecision.shouldCreateCandidate && ruleDecision.reasons.includes('explicit_project_tracking_request')) {
    return { decision: ruleDecision, source: 'rules' };
  }

  const chatFn = createChatFn ? await createChatFn() : undefined;
  if (!chatFn) {
    return { decision: ruleDecision, source: 'rules' };
  }

  try {
    const response = await chatFn(buildProjectSignalPrompt(input), signal);
    const decision = normalizeLlmProjectSignalDecision(parseJsonMarkdown(response), input);
    return { decision, source: 'llm' };
  } catch (error) {
    return {
      decision: ruleDecision,
      error: error instanceof Error ? error.message : String(error),
      source: 'rules_fallback'
    };
  }
}

export function getProjectSignalDiagnostics(input: DetectProjectSignalInput): ProjectSignalDiagnostics {
  const userMessages = input.messages.filter((message) => message.role === 'user' && message.content.trim());
  const userText = compact(userMessages.map((message) => message.content).join('\n'), 4000);
  const latest = userMessages[userMessages.length - 1];
  const route = input.routeSnapshot;

  return {
    latestUserPreview: latest ? trimText(latest.content.replace(/\s+/g, ' ').trim(), 120) : '',
    matchedAgreementTerms: collectMatches(userText, AGREEMENT_TERMS),
    matchedExplicitPatterns: collectPatternLabels(userText, EXPLICIT_PATTERNS),
    matchedExplicitTerms: collectMatches(userText, EXPLICIT_TERMS),
    matchedProjectTerms: collectMatches(userText, PROJECT_TERMS),
    matchedTaskTerms: collectMatches(userText, TASK_TERMS),
    matchedTimeTerms: collectMatches(userText, TIME_TERMS),
    routeHasCurrentGoal: Boolean(route?.currentGoal),
    routeOpenTaskCount: route?.openTasks?.length ?? 0,
    userChars: userText.length,
    userMessageCount: userMessages.length
  };
}

function buildProjectSignalPrompt(input: DetectProjectSignalInput): string {
  const lines: string[] = [PROJECT_SIGNAL_LLM_PROMPT, '', `conversationId: ${input.conversationId}`, `workspaceId: ${input.workspaceId || '(none)'}`];

  if (input.routeSnapshot) {
    lines.push(
      '',
      '当前会话线路快照：',
      JSON.stringify(
        {
          currentGoal: input.routeSnapshot.currentGoal,
          currentTopic: input.routeSnapshot.currentTopic,
          decisions: input.routeSnapshot.decisions.slice(0, 4),
          openTasks: input.routeSnapshot.openTasks.slice(0, 6),
          summary: input.routeSnapshot.summary
        },
        null,
        2
      )
    );
  }

  lines.push('', '最近消息：', formatSignalMessages(input.messages));
  return lines.join('\n');
}

function formatSignalMessages(messages: ConversationRouteMessage[]): string {
  return messages.map((message) => `[seq=${message.seq} role=${message.role}] ${trimText(message.content.replace(/\s+/g, ' ').trim(), 700)}`).join('\n');
}

function normalizeLlmProjectSignalDecision(raw: unknown, input: DetectProjectSignalInput): ProjectSignalDecision {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const userMessages = input.messages.filter((message) => message.role === 'user' && message.content.trim());
  const userSeqs = new Set(userMessages.map((message) => String(message.seq)));
  const latestUser = userMessages[userMessages.length - 1];
  const reasons = cleanStringList(obj.reasons, 8).filter(isProjectSignalReason) as ProjectSignalReason[];
  const signalScore = clamp(Number.isFinite(obj.signalScore as number) ? Number(obj.signalScore) : 0);
  const shouldCreateCandidate = Boolean(obj.shouldCreateCandidate) && signalScore >= CANDIDATE_THRESHOLD;
  const needsUserConfirmation = shouldCreateCandidate ? true : Boolean(obj.needsUserConfirmation);

  if (!shouldCreateCandidate) {
    return {
      needsUserConfirmation,
      reasons,
      shouldCreateCandidate: false,
      shouldLinkExistingProject: false,
      signalScore
    };
  }

  const candidateObj = obj.candidate && typeof obj.candidate === 'object' ? (obj.candidate as Record<string, unknown>) : {};
  const evidenceMessageIds = cleanStringList(candidateObj.evidenceMessageIds, 20).filter((id) => userSeqs.has(id));
  return {
    candidate: {
      evidenceMessageIds: evidenceMessageIds.length ? evidenceMessageIds : userMessages.map((message) => String(message.seq)),
      evidenceSummary: trimText(readString(candidateObj.evidenceSummary) || latestUser?.content.replace(/\s+/g, ' ').trim() || '', 240),
      proposedGoal: trimText(readString(candidateObj.proposedGoal) || inferProjectGoal(formatUserText(userMessages), input.routeSnapshot), 180),
      proposedName: trimText(readString(candidateObj.proposedName) || inferProjectName(formatUserText(userMessages), input.routeSnapshot), 48),
      suggestedMilestones: normalizeMilestoneDrafts(candidateObj.suggestedMilestones),
      suggestedReminders: normalizeReminderDrafts(candidateObj.suggestedReminders)
    },
    needsUserConfirmation: true,
    reasons: reasons.length ? reasons : ['recurring_goal'],
    shouldCreateCandidate: true,
    shouldLinkExistingProject: false,
    signalScore
  };
}

function isProjectSignalReason(value: string): value is ProjectSignalReason {
  return (
    value === 'explicit_project_tracking_request' ||
    value === 'recurring_goal' ||
    value === 'multi_step_plan' ||
    value === 'deadline_or_meeting' ||
    value === 'external_stakeholder' ||
    value === 'agreement_or_decision' ||
    value === 'cross_conversation_reference' ||
    value === 'active_project_similarity'
  );
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatUserText(messages: ConversationRouteMessage[]): string {
  return compact(messages.map((message) => message.content).join('\n'), 4000);
}

function normalizeMilestoneDrafts(value: unknown): ProjectMilestoneDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .map<ProjectMilestoneDraft | null>((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const title = trimText(readString(obj.title), 80);
      if (!title) return null;
      return {
        confidence: clamp(Number.isFinite(obj.confidence as number) ? Number(obj.confidence) : 0.6),
        description: trimText(readString(obj.description), 180) || undefined,
        title
      };
    })
    .filter((item): item is ProjectMilestoneDraft => Boolean(item))
    .slice(0, 3);
}

function normalizeReminderDrafts(value: unknown): ProjectReminderDraft[] {
  if (!Array.isArray(value)) return [];
  return [];
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

  const patterns = [
    /([^，。！？\n]{4,32})(?:，|,)?(?:制定|做|安排|规划)(?:一个|个|一下)?(?:计划|行程|清单|时间安排)/,
    /([^，。！？\n]{4,32})(?:，|,)?(?:帮我)?(?:列一下|列个|列|安排|规划)(?:准备)?(?:清单|计划|行程|时间安排)/,
    /(?:做|实现|设计|开发|推进|跟进|完成)(?:一个|这个|一下)?([^，。！？\n]{4,32})(?:项目|系统|功能|计划|方案|文档)?/,
    /([^，。！？\n]{4,32})(?:项目|系统|功能|计划|方案|文档)/
  ];
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

function matchesAnyPattern(text: string, patterns: Array<{ label: string; pattern: RegExp }>): boolean {
  return patterns.some((item) => item.pattern.test(text));
}

function countMatches(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term.toLowerCase()) ? 1 : 0), 0);
}

function collectMatches(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase())).slice(0, 12);
}

function collectPatternLabels(text: string, patterns: Array<{ label: string; pattern: RegExp }>): string[] {
  return patterns.filter((item) => item.pattern.test(text)).map((item) => item.label);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
