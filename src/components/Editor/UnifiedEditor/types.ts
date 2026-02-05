import type { EditorProps } from '@tiptap/pm/view';
import type { Editor, EditorEvents, Range } from '@tiptap/react';
import type { ReactNode } from 'react';

import type { MentionItem, ResourceUploadHandler, SlashCommandConfig } from '../extensions';

/**
 * 工具栏位置
 */
export type ToolbarPosition = 'top' | 'bottom' | 'floating' | 'none';

/**
 * AI 续写上下文
 */
export interface AICompletionContext {
  /** 当前编辑器的全文内容 */
  text: string;
  /** 编辑器实例 */
  editor: Editor;
  /** 当前光标范围（slash command 的位置） */
  range: Range;
}

/**
 * AI 续写回调函数
 */
export interface AICompletionCallbacks {
  /** 收到流式响应时调用（每次收到新内容时追加） */
  onChunk?: (chunk: string) => void;
  /** 完成时调用，可选传入完整内容用于高亮 */
  onFinish?: (completion: string) => void;
  /** 出错时调用 */
  onError?: (error: Error) => void;
}

/**
 * AI 续写处理函数类型
 * 外部实现此函数来提供 AI 续写能力
 *
 * @param context - AI 续写上下文，包含当前文本、编辑器实例和光标范围
 * @param callbacks - 回调函数，用于处理流式响应、完成和错误
 * @returns 返回一个函数用于取消正在进行的请求（可选）
 *
 * @example
 * ```typescript
 * const handleAIComplete: AICompletionHandler = (context, callbacks) => {
 *   const controller = new AbortController();
 *
 *   fetch('/api/generate', {
 *     method: 'POST',
 *     body: JSON.stringify({ prompt: context.text }),
 *     signal: controller.signal,
 *   })
 *     .then(response => response.body.getReader())
 *     .then(async reader => {
 *       let result = '';
 *       while (true) {
 *         const { done, value } = await reader.read();
 *         if (done) break;
 *         const chunk = new TextDecoder().decode(value);
 *         result += chunk;
 *         callbacks.onChunk?.(chunk);
 *       }
 *       callbacks.onFinish?.(result);
 *     })
 *     .catch(err => callbacks.onError?.(err));
 *
 *   return () => controller.abort();
 * };
 * ```
 */
export type AICompletionHandler = (context: AICompletionContext, callbacks: AICompletionCallbacks) => (() => void) | void;

/**
 * 播放器控制接口 - 用于解耦业务逻辑
 */
export interface PlayerControls {
  /** 播放 */
  play?: () => void;
  /** 暂停 */
  pause?: () => void;
  /** 当前是否播放中 */
  isPlaying?: boolean;
  /** 外部同步播放状态 */
  onPlayStateChange?: (isPlaying: boolean) => void;
  /** 前进指定秒数 */
  seekForward?: (seconds: number) => void;
  /** 后退指定秒数 */
  seekBackward?: (seconds: number) => void;
  /** 截图 */
  screenshot?: () => void;
  /** 获取当前时间 */
  getCurrentTime?: () => number;
}

/**
 * 图片上传处理函数类型
 */
export type ImageUploadHandler = (file: File) => Promise<string | void>;

/**
 * 统一编辑器属性
 */
export interface UnifiedEditorProps {
  /** 编辑器内容（Markdown 或 HTML） */
  content?: string;
  /** 笔记 ID（用于保存） */
  noteId?: string;
  /** 编辑器模式 */
  readonly?: boolean;
  /** 占位符文本 */
  placeholder?: string;
  /** 自定义类名 */
  className?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 工具栏位置 */
  toolbarPosition?: ToolbarPosition;
  /** 工具栏右侧自定义内容 */
  toolbarRight?: ReactNode;
  /** 是否显示 BubbleMenu */
  showBubbleMenu?: boolean;
  /** 是否显示播放控制 */
  showPlayerControls?: boolean;
  /** 是否显示截图和标记按钮 */
  showMediaButtons?: boolean;
  /** 可注入的 editorProps */
  editorProps?: EditorProps;
  /** 内容更新回调（返回 Markdown 格式） */
  onChange?: (content: string) => void;
  /** 完整更新回调（包含编辑器事件） */
  onUpdate?: (e: EditorEvents['update']) => void;
  /** 获取编辑器实例的回调 */
  onEditorReady?: (editor: Editor) => void;
  /** 是否使用 Markdown 模式（输入输出为 Markdown） */
  markdown?: boolean;
  /** 自定义 Mention 项列表 */
  mentionItems?: MentionItem[];
  /** Slash Command 配置 */
  slashCommandConfig?: SlashCommandConfig;
  /** 自定义 extensions */
  additionalExtensions?: any[];
  /** 播放器控制接口 - 用于解耦业务逻辑 */
  playerControls?: PlayerControls;
  /** 图片上传处理函数 */
  onImageUpload?: ImageUploadHandler;
  /** 资源上传处理函数 */
  onResourceUpload?: ResourceUploadHandler;
  /** AI 续写处理函数 */
  onAIComplete?: AICompletionHandler;
  /** 控制工具栏是否在 blur 时保持可见 */
  shouldKeepToolbarVisible?: () => boolean;
}

/**
 * 工具栏属性
 */
export interface UnifiedToolbarProps {
  /** 编辑器实例 */
  editor: Editor | null;
  /** 是否可见 */
  visible?: boolean;
  /** 样式类名 */
  className?: string;
  /** 工具栏位置 */
  position?: ToolbarPosition;
  /** 工具栏右侧自定义内容 */
  toolbarRight?: React.ReactNode;
  /** 是否显示媒体操作按钮（截图、标记等） */
  showMediaButtons?: boolean;
  /** 是否显示播放器控制 */
  showPlayerControls?: boolean;
  /** 是否为迷你模式（只显示播放控制） */
  mini?: boolean;
  /** 播放器控制回调 */
  playerControls?: PlayerControls;
  /** 取消隐藏工具栏的回调（用于浮动工具栏防止下拉菜单导致工具栏隐藏） */
  onInteractionStart?: () => void;
}
