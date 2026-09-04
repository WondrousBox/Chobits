import type { AIPromptInspectionSource } from './prompt-inspector';

/**
 * 全局 AI 提示词观察（inspection）配置。
 *
 * 所有 Pi runtime 最终发给模型的对话请求都会经过 prompt-inspector，
 * 它是观察真实下发 prompt 的统一入口，调用方不应在业务服务里散落
 * console.log(prompt)。本配置控制 inspect 是否生效、是否落盘到内存
 * 队列、以及是否打印到控制台。
 *
 * 默认 enabled=false（生产姿态），仅靠单次 ChatRequest.extras
 * 临时打开；本地排障时把 enabled 改成 true，或配合下面的 allowlist
 * 收敛到只关心少数 source / agentId。
 */
export const AI_PROMPT_INSPECTOR_SETTINGS = {
  /**
   * 总开关。设为 false 时：
   *   - 不再打印 prompt；
   *   - 不再写入最近记录的内存队列；
   *   - 单次 ChatRequest.extras 里的 debugPrompt / inspectPrompt /
   *     showPrompt 仍可临时打开（用于本地排障单次请求）。
   */
  enabled: false,

  /**
   * 是否在内存中保留最近 MAX_RECENT_INSPECTIONS 条 inspection 记录，
   * 供 listRecentAIPromptInspections() 读取（用于调试面板 / 自动化
   * 测试等场景）。关闭后 inspect 行为只剩 console 打印一条路径。
   */
  keepRecent: true,

  /**
   * 是否把格式化后的 prompt 内容直接打印到 console。
   * 仅控制 console 输出，不影响 keepRecent 与单次 extras 覆盖。
   * 调用方也可以通过 inspectAIPrompt(record, { logger }) 自定义
   * 输出目标，那条路径不受本字段影响。
   */
  printToConsole: false,

  /**
   * Source 白名单：仅当 inspection record 的 source 在该列表中时才
   * 允许打印 / 落盘。留空（默认）表示不按 source 过滤。
   *
   * 合法取值见 AIPromptInspectionSource：
   *   - 'pi-session'             // 普通聊天会话
   *   - 'pi-task-chat'           // 后台任务型 chat（task-chat）
   *   - 'pi-coding-session'      // coding agent 会话
   *   - 'pi-forked-skill'        // forked skill 子会话
   *
   * 用例：只想看后台任务型 chat 的 prompt 时可写
   *   sourceAllowlist: ['pi-task-chat']
   * 并配合 agentIdAllowlist 进一步收敛。
   */
  sourceAllowlist: ['pi-task-chat'] as AIPromptInspectionSource[],

  /**
   * AgentId 白名单：仅当 inspection record 的 agentId 在该列表中时
   * 才允许打印 / 落盘。留空（默认）表示不按 agentId 过滤。
   *
   * 现存 agentId：
   *   - 'chat'        // 聊天会话与后台任务（title / tag 等）
   *   - 'assistant'   // 助手 profile
   *   - 'coder'       // coding agent 会话
   *
   * 用例：只观察聊天会话的 prompt 时可写
   *   agentIdAllowlist: ['chat']
   */
  agentIdAllowlist: [] as string[]
};
