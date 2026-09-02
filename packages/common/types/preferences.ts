// 预览模式类型: 'window' 表示弹窗，'panel' 表示右侧面板
export type PreviewMode = 'window' | 'panel';

// 偏好设置配置接口
export interface PreferencesConfig {
  // 预览模式
  previewMode: PreviewMode;
  // WebRecorder 麦克风设备ID
  webRecorderDeviceId?: string;
  miniChatWindowEnabled: boolean;
  // 开机自启动(登录系统后自动启动应用)
  launchAtLoginEnabled: boolean;
  /** 全局功能旗标覆盖（键为 FeatureKey，未设置的项用 packages/common/feature-flags 中的默认值） */
  featureFlags?: Record<string, boolean>;
}
