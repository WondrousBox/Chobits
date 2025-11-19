import type { BrowserWindowConstructorOptions } from 'electron';

// 跟随窗口位置偏好模式
export type FollowerPreferMode = 'auto' | 'prefer-right' | 'prefer-left' | 'prefer-bottom' | 'prefer-top' | 'overlap-center';

// 窗口配置的键类型
export interface CustomWindowKeys { }

export type WindowKey = keyof CustomWindowKeys | (string & {});

// 跟随窗口位置类型
export type FollowerSide = 'right' | 'left' | 'bottom' | 'top' | 'overlap';

export interface WindowConfig {
  routeHash: string | (() => string);
  options: BrowserWindowConstructorOptions;
  fillWorkArea?: boolean;
  showOnReady?: boolean;
  openDevTools?: boolean;
  autoCenterOn?: 'parent-display' | 'primary-display' | 'none';
  closeOnBlur?: boolean;
  /**
   * 当窗口显示时，是否临时暂停主窗口的 hover 监控（用于透明跟随窗口防止穿透干扰）
   */
  suspendHoverMonitorOnShow?: boolean;
  /**
   * 当通过管理器显示窗口时，优先使用 showInactive（若可用），避免抢夺焦点。
   */
  preferShowInactive?: boolean;
  /**
   * 窗口跟随配置
   * - true: 跟随主窗口移动
   * - false: 不跟随
   * - 'auto': 由窗口管理器自动决定是否跟随
   */
  followMain?: boolean | 'auto';
  /**
   * 跟随窗口位置偏好模式
   * - 'auto': 自动选择最佳位置
   * - 'prefer-right': 优先右侧
   * - 'prefer-left': 优先左侧
   * - 'prefer-bottom': 优先底部
   * - 'prefer-top': 优先顶部
   * - 'overlap-center': 重叠居中
   */
  followerPreferMode?: FollowerPreferMode;
  /**
   * 当使用 overlap-center 模式时，是否启用半透明效果以避免遮挡精灵
   * 默认: false
   */
  enableOverlapTransparency?: boolean;
  /**
   * 当使用 overlap-center 模式时，是否强制居中（忽略屏幕边界限制）
   * 默认: false
   */
  forceCenterAlignment?: boolean;
  parent?: 'main' | undefined;
  /**
   * If true, the window will open maximized on first show.
   * - When showOnReady !== false, it maximizes right before showing on ready-to-show to avoid flicker.
   * - When showOnReady === false, it maximizes on the first manual show.
   */
  startMaximized?: boolean;
  /**
   * If true, the window will remember its position and size for next time.
   */
  rememberState?: boolean;
  /** 平台差异化覆盖（仅用于 JSON 配置文件，运行期会根据当前平台合并到配置中） */
  platformOverlays?: Partial<Record<NodeJS.Platform, Partial<WindowConfig & { options: Partial<BrowserWindowConstructorOptions> }>>>;
}
