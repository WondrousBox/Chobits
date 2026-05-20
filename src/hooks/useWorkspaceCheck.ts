import { useEffect } from 'react';

/**
 * useWorkspaceCheck
 *
 * 历史用途：应用启动时检查 workspace 是否存在，不存在则直接打开 workspaceWizard。
 *
 * 现在：该逻辑已迁移到新手引导 Quest 系统（QuestEngine + onboarding.workspace.create）。
 * 主进程 `initOnboardingQuestEngine` 会在 APP_STARTED 时 tick；若无 workspace，会启动固定
 * onboarding.workspace.create routine。routine 先展示带按钮的引导气泡，用户点击后再打开
 * workspaceWizard，并在完成后交给 QuestEngine 发奖。
 *
 * 因此本 hook 保留为 no-op 占位，避免破坏 App.tsx 等调用点；后续如不再需要，可直接删除引用。
 */
export function useWorkspaceCheck(): void {
  useEffect(() => {
    // 由 QuestEngine 接管 — 见 electron/main/handlers/index.ts 的 initOnboardingQuestEngine。
  }, []);
}
