export type ChatOverlaySide = 'left' | 'right';

export const CHAT_OVERLAY_SETTINGS = {
  enabledFromAssistantInput: true,
  side: 'right' as ChatOverlaySide,
  expandedWidth: 560,
  collapsedWidth: 28,
  autoCollapseEnabled: false,
  autoCollapseDelayMs: 7000,
  entryAnimationMs: 260
};

export function resolveChatOverlaySide(value: unknown): ChatOverlaySide {
  return value === 'left' || value === 'right' ? value : CHAT_OVERLAY_SETTINGS.side;
}
