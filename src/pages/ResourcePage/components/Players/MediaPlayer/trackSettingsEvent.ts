/**
 * 轨道设置事件系统
 *
 * 用于 ResourceSubtitlePlayer（轨道状态持有者）与 MediaControls（UI 展示）之间的通信。
 * - ResourceSubtitlePlayer 广播可用轨道及其启用状态
 * - MediaControls 展示轨道设置弹出框，用户切换时发送 toggle 事件
 * - ResourceSubtitlePlayer 监听 toggle 事件并更新状态
 */

/** 轨道类型 */
export type TrackType = 'subtitle' | 'tts' | 'clip';

/** 单个轨道的信息 */
export interface TrackSettingsItem {
  /** 轨道唯一标识（subtitle: 'track-0'/'track-1', tts: 'main'/'ja', clip: 'clip'） */
  id: string;
  /** 显示标签 */
  label: string;
  /** 轨道类型 */
  type: TrackType;
  /** 是否启用 */
  enabled: boolean;
  /** 是否为主轨道（主轨道始终启用，不允许禁用） */
  isMain?: boolean;
}

// ---- 广播轨道信息 ----

export const TRACK_SETTINGS_UPDATE_EVENT = 'custom:track-settings-update';

/** 广播当前可用轨道及其启用状态（由 ResourceSubtitlePlayer 调用） */
export function dispatchTrackSettings(items: TrackSettingsItem[]): void {
  window.dispatchEvent(
    new CustomEvent<TrackSettingsItem[]>(TRACK_SETTINGS_UPDATE_EVENT, {
      detail: items
    })
  );
}

// ---- 切换轨道 ----

export interface TrackTogglePayload {
  id: string;
  type: TrackType;
}

export const TRACK_TOGGLE_EVENT = 'custom:track-toggle';

/** 请求切换某个轨道的启用状态（由 MediaControls / TrackSettingsPopover 调用） */
export function dispatchTrackToggle(payload: TrackTogglePayload): void {
  window.dispatchEvent(
    new CustomEvent<TrackTogglePayload>(TRACK_TOGGLE_EVENT, {
      detail: payload
    })
  );
}
