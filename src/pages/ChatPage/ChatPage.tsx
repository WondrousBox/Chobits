import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbArrowDown, TbChevronRight, TbDots, TbEdit, TbHistory, TbLoader2, TbPin, TbPlus, TbRefresh, TbShare, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { ChatInputWithService, ChatMessageRenderer } from '@/components/chat';
import ThinkingActivity from '@/components/chat/ThinkingActivity';
import type { ToolActivity } from '@/components/chat/ToolCallActivity';
import ToolCallActivity from '@/components/chat/ToolCallActivity';
import DragAbleTitle from '@/components/common/DragAbleTitle';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { formatDateTime, formatRelativeTime } from '@/lib/time';

import { useChatSelection } from './context/ChatSelectionContext';

interface ChatPageProps {
  hideTitleBar?: boolean;
}

export default function ChatPage({ hideTitleBar = false }: ChatPageProps): JSX.Element {
  const { providerId, modelId, presetId, agentId, codingWorkspaceRoot, codingWorkspaceLabel, setProviderId, setModelId, setPresetId, setAgentId, setCodingWorkspace } = useChatSelection();
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; createdAt?: number; activities?: ToolActivity[]; thinking?: string; isThinking?: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const disposerRef = useRef<{ dispose: () => void; cancel: () => Promise<any> } | null>(null);
  const assistantIndexRef = useRef<number>(-1);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  // Track conversations that are waiting for AI-generated titles
  const [generatingTitleIds, setGeneratingTitleIds] = useState<Set<string>>(new Set());

  // 控制历史会话列表的显示/隐藏，默认隐藏
  const [showHistory, setShowHistory] = useState(false);

  // 删除确认弹窗状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);

  const currentConversation = useMemo(() => conversations.find((c) => c.id === conversationId) || null, [conversations, conversationId]);

  // Load conversations list
  const loadConversations = async (): Promise<void> => {
    setLoadingConvs(true);
    try {
      const rows = await window.YUA.ai.listConversations({ includeDeleted: false, limit: 200 });
      setConversations(rows || []);
    } catch {
      // Let parent surface errors
    }
    setLoadingConvs(false);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadConversations();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  // Select conversation and load its messages
  const selectConversation = async (id: string): Promise<void> => {
    setSelectedConvId(id);
    setConversationId(id);
    try {
      const rows = await window.YUA.ai.listMessages(id, 2000, 0);
      const mapped = (rows || []).map((r: any) => {
        let activities: ToolActivity[] | undefined;
        if (r.metadata) {
          try {
            const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
            if (Array.isArray(meta?.toolCalls)) {
              activities = meta.toolCalls.map((tc: any) => {
                const base: ToolActivity = { callId: tc.callId, name: tc.name, args: tc.args, status: 'done' as const, result: tc.result };
                // Reconstruct choiceRequest/choiceAnswers for askUserTool from persisted args/result
                if (tc.name === 'askUserTool' || tc.name === 'ask-user') {
                  const parsedArgs = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
                  // result may be wrapped as { content, details } (AgentToolResult) or flat
                  const resultDetails = tc.result?.details || tc.result;
                  if (parsedArgs?.questions && resultDetails?.choiceId) {
                    base.choiceRequest = {
                      choiceId: resultDetails.choiceId,
                      toolCallId: tc.callId,
                      questions: parsedArgs.questions,
                      prompt: parsedArgs.prompt
                    };
                    if (resultDetails.answers) {
                      base.choiceAnswers = resultDetails.answers;
                    }
                  }
                }
                return base;
              });
            }
          } catch {
            /* ignore parse errors */
          }
        }
        return { role: r.role, content: r.content, createdAt: r.createdAt, ...(activities ? { activities } : {}) };
      });
      setMessages(mapped);
    } catch {
      // Let parent surface errors
    }
  };

  // Start a brand new conversation (reset state)
  const newConversation = useCallback((): void => {
    setSelectedConvId(null);
    setConversationId(undefined);
    setMessages([]);
  }, []);

  // Open rename dialog
  const openRenameDialog = (id: string): void => {
    const current = conversations.find((c) => c.id === id);
    setRenamingConvId(id);
    setNewTitle(current?.title || '');
    setRenameDialogOpen(true);
  };

  // Apply rename
  const applyRename = async (): Promise<void> => {
    if (!renamingConvId) return;
    await window.YUA.ai.renameConversation(renamingConvId, newTitle.trim() || '未命名会话');
    setRenameDialogOpen(false);
    await loadConversations();
  };

  // 打开删除确认弹窗
  const openDeleteDialog = (id: string): void => {
    setDeletingConvId(id);
    setDeleteDialogOpen(true);
  };

  // 确认永久删除会话
  const confirmDeleteConversation = async (): Promise<void> => {
    if (!deletingConvId) return;
    const id = deletingConvId;
    const prevSelected = selectedConvId;
    try {
      await window.YUA.ai.hardDeleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (prevSelected === id) newConversation();
      toast.success('已删除会话');
    } catch (e: any) {
      console.error(e);
      toast.error('删除失败');
    } finally {
      setDeleteDialogOpen(false);
      setDeletingConvId(null);
    }
  };

  // 使用 ref 保存 start 函数引用，供 IPC 回调使用
  const startRef =
    useRef<
      (params: { content: string; providerId?: string; modelId?: string; preferredPresetId?: string; agentId?: string; codingWorkspaceRoot?: string; codingWorkspaceLabel?: string }) => Promise<void>
    >();

  // Listen for initial message from assistant window (on:window:open:ready)
  useEffect(() => {
    const handlePayload = (payload: any): void => {
      if (!payload?.initialMessage) return;
      // 清除缓存 payload，防止关闭后再次打开时重复触发
      window.ipcRenderer?.invoke('window:payload:clear', 'chat').catch(() => {});
      // 重置为新对话状态
      newConversation();
      // 延迟一帧确保状态已重置，再发起对话
      setTimeout(() => {
        if (payload.providerId) {
          setProviderId(payload.providerId);
        }
        if (payload.modelId) {
          setModelId(payload.modelId);
        }
        if (payload.preferredPresetId || payload.presetId) {
          setPresetId(payload.preferredPresetId || payload.presetId);
        }
        if (payload.agentId) {
          setAgentId(payload.agentId);
        }
        if (typeof payload.codingWorkspaceRoot === 'string' && payload.codingWorkspaceRoot.trim()) {
          setCodingWorkspace({
            root: payload.codingWorkspaceRoot,
            label: typeof payload.codingWorkspaceLabel === 'string' ? payload.codingWorkspaceLabel : undefined
          });
        }
        startRef.current?.({
          content: payload.initialMessage,
          providerId: payload.providerId,
          modelId: payload.modelId,
          preferredPresetId: payload.preferredPresetId || payload.presetId,
          agentId: payload.agentId,
          codingWorkspaceRoot: payload.codingWorkspaceRoot,
          codingWorkspaceLabel: payload.codingWorkspaceLabel
        });
      }, 50);
    };

    const ipcHandler = (_event: any, data: any): void => handlePayload(data);
    window.ipcRenderer?.on('on:window:open:ready', ipcHandler);

    // Fallback: 主动拉取缓存 payload（避免 race condition，仅首次加载执行）
    let fallbackDone = false;
    const timer = setTimeout(async () => {
      if (fallbackDone) return;
      fallbackDone = true;
      try {
        const cached = await window.YUA.window['window:payload:get']('chat');
        if (cached?.initialMessage) handlePayload(cached);
      } catch {
        /* noop */
      }
    }, 120);

    return () => {
      window.ipcRenderer?.off('on:window:open:ready', ipcHandler);
      clearTimeout(timer);
    };
  }, [newConversation, setAgentId, setCodingWorkspace, setModelId, setPresetId, setProviderId]);

  // Listen for conversation title updates from main process
  useEffect(() => {
    const dispose = window.YUA.ai.onConversationTitleUpdated((data) => {
      if (data.status === 'generating') {
        setGeneratingTitleIds((prev) => new Set(prev).add(data.conversationId));
      } else {
        // 'done' or 'error' — stop shimmer and refresh list
        setGeneratingTitleIds((prev) => {
          const next = new Set(prev);
          next.delete(data.conversationId);
          return next;
        });
        // Update title in local state immediately if available
        if (data.title) {
          setConversations((prev) => prev.map((c) => (c.id === data.conversationId ? { ...c, title: data.title } : c)));
        } else {
          // Fallback: reload from DB
          loadConversations();
        }
      }
    });
    return () => dispose();
  }, []);

  const start = async (params: {
    content: string;
    providerId?: string;
    modelId?: string;
    preferredPresetId?: string;
    agentId?: string;
    codingWorkspaceRoot?: string;
    codingWorkspaceLabel?: string;
    webSearchEnabled?: boolean;
    characterPersonaEnabled?: boolean;
  }): Promise<void> => {
    const content = params.content;
    const selectedProviderId = params.providerId || providerId;
    const selectedModelId = params.modelId || modelId;
    const preferredPresetId = params.preferredPresetId || presetId;
    const selectedAgentId = params.agentId || agentId;
    const selectedCodingWorkspaceRoot = params.codingWorkspaceRoot || codingWorkspaceRoot;
    const selectedCodingWorkspaceLabel = params.codingWorkspaceLabel || codingWorkspaceLabel;

    if (!content.trim() || !selectedProviderId || !selectedModelId) return;

    const resolvedPreset = await window.YUA.ai.resolveUsablePreset(selectedProviderId, preferredPresetId);
    if (!resolvedPreset?.id) {
      toast.error('当前服务商还没有可用预设，请先到 AI 设置中完成配置');
      return;
    }

    setProviderId(selectedProviderId);
    setModelId(selectedModelId);
    if (resolvedPreset.id !== preferredPresetId) {
      setPresetId(resolvedPreset.id);
    }

    // 1) 追加用户消息 + 占位的助手消息
    const userMsg = { role: 'user' as const, content, createdAt: Date.now() };
    setMessages((prev) => {
      const next = [...prev, userMsg, { role: 'assistant' as const, content: '', createdAt: Date.now() }];
      assistantIndexRef.current = next.length - 1;
      return next;
    });
    setLoading(true);
    // User sent a message → force auto-scroll to bottom
    resetAutoScroll();

    // 2) 构造上下文（包含历史消息 + 新用户消息）
    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt }));

    const disposer = await window.YUA.ai.chatStream(
      {
        conversationId,
        messages: history as any,
        agentId: selectedAgentId,
        providerId: selectedProviderId,
        providerPresetId: resolvedPreset.id,
        stream: true,
        extras: {
          model: selectedModelId,
          ...(params.webSearchEnabled ? { webSearchEnabled: true } : {}),
          ...(params.characterPersonaEnabled ? { characterPersonaEnabled: true } : {}),
          ...(selectedAgentId === 'coder' && selectedCodingWorkspaceRoot
            ? {
                codingWorkspaceRoot: selectedCodingWorkspaceRoot,
                codingWorkspaceLabel: selectedCodingWorkspaceLabel || undefined
              }
            : {})
        }
      },
      (ev: any) => {
        if (ev?.type === 'metadata' && ev.data?.conversationId) {
          setConversationId(ev.data.conversationId);
          setSelectedConvId(ev.data.conversationId);
          // Refresh conversation list so the new conversation appears in sidebar
          loadConversations();
        }
        if (ev?.type === 'tool_call' && ev.data) {
          setMessages((prev) => {
            const idx = assistantIndexRef.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = prev.slice();
            const m = copy[idx];
            const existing = m.activities || [];
            const activity: ToolActivity = { callId: ev.data.callId, name: ev.data.name, args: ev.data.args, status: 'calling', label: ev.data.label };
            copy[idx] = { ...m, activities: [...existing, activity] };
            return copy;
          });
        }
        if (ev?.type === 'tool_result' && ev.data) {
          setMessages((prev) => {
            const idx = assistantIndexRef.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = prev.slice();
            const m = copy[idx];
            const updated = (m.activities || []).map((a) => (a.callId === ev.data.callId ? { ...a, status: 'done' as const, result: ev.data.result } : a));
            copy[idx] = { ...m, activities: updated };
            return copy;
          });
        }
        if (ev?.type === 'tool_progress' && ev.data) {
          setMessages((prev) => {
            const idx = assistantIndexRef.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = prev.slice();
            const m = copy[idx];
            const updated = (m.activities || []).map((a) => (a.callId === ev.data.callId ? { ...a, progress: ev.data.progress, progressMessage: ev.data.message } : a));
            copy[idx] = { ...m, activities: updated };
            return copy;
          });
        }
        if (ev?.type === 'user_choice_request' && ev.data) {
          // Attach choice request data to the matching askUserTool activity
          setMessages((prev) => {
            const idx = assistantIndexRef.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = prev.slice();
            const m = copy[idx];
            const updated = (m.activities || []).map((a) => (a.callId === ev.data.toolCallId ? { ...a, choiceRequest: ev.data } : a));
            copy[idx] = { ...m, activities: updated };
            return copy;
          });
        }
        if (ev?.type === 'thinking_delta' && ev.data?.text) {
          setMessages((prev) => {
            const idx = assistantIndexRef.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = prev.slice();
            const m = copy[idx];
            copy[idx] = { ...m, thinking: (m.thinking || '') + ev.data.text, isThinking: true };
            return copy;
          });
        }
        if (ev?.type === 'delta' && ev.data?.text) {
          const delta: string = ev.data.text;
          setMessages((prev) => {
            const idx = assistantIndexRef.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = prev.slice();
            const m = copy[idx];
            copy[idx] = { ...m, content: (m.content || '') + delta, isThinking: false };
            return copy;
          });
        }
        if (ev?.type === 'message_completed' && ev.data?.message?.content) {
          // Ensure final content reflected, in case no deltas were sent
          const full: string = ev.data.message.content;
          setMessages((prev) => {
            const idx = assistantIndexRef.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = prev.slice();
            const m = copy[idx];
            copy[idx] = { ...m, content: full, createdAt: ev.data.message.createdAt || m.createdAt, isThinking: false };
            return copy;
          });
          setLoading(false);
          // capture conversationId from completed metadata if present
          const metaConvId = ev.data?.message?.metadata?.conversationId;
          if (metaConvId && !conversationId) setConversationId(metaConvId);
        }
        if (ev?.type === 'message_completed') {
          setLoading(false);
          disposerRef.current?.dispose?.();
          disposerRef.current = null;
          // Refresh conversation list to show updated message count
          loadConversations();
        }
        if (ev?.type === 'error') {
          setMessages((prev) => {
            const idx = assistantIndexRef.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = prev.slice();
            const m = copy[idx];
            copy[idx] = { ...m, content: (m.content || '') + `\n[错误] ${ev.data?.message || ''}` };
            return copy;
          });
          setLoading(false);
        }
      }
    );
    disposerRef.current = disposer;
  };

  // Handle user choice submission for ask-user tool
  const handleUserChoiceSubmit = async (choiceId: string, answers: Record<string, string[]>): Promise<void> => {
    // Immediately mark the activity as submitted in UI
    setMessages((prev) => {
      const idx = assistantIndexRef.current;
      if (idx < 0 || idx >= prev.length) return prev;
      const copy = prev.slice();
      const m = copy[idx];
      const updated = (m.activities || []).map((a) => (a.choiceRequest?.choiceId === choiceId ? { ...a, choiceAnswers: answers } : a));
      copy[idx] = { ...m, activities: updated };
      return copy;
    });
    // Send response to main process to unblock the tool
    try {
      await window.YUA.ai.sendUserChoiceResponse({ choiceId, answers });
    } catch (e) {
      console.error('[ChatPage] Failed to send user choice response:', e);
    }

    // Handle topic switch: if user chose __new_conversation__, start a new conversation
    // with the last user message automatically resent
    const topicAnswer = answers['topic_switch'];
    if (topicAnswer?.includes('__new_conversation__')) {
      // Find the last user message (the one that triggered the topic change)
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMsg?.content) {
        const savedContent = lastUserMsg.content;
        // Wait a short moment for the agent to finish responding, then switch
        setTimeout(() => {
          // Stop current stream if still running
          disposerRef.current?.cancel().catch(() => {
            /* ignore */
          });
          disposerRef.current?.dispose?.();
          disposerRef.current = null;
          setLoading(false);
          // Reset to new conversation
          newConversation();
          // Auto-send the saved message in the new conversation after state reset
          setTimeout(() => {
            startRef.current?.({ content: savedContent });
          }, 100);
        }, 500);
      }
    }
  };

  // Keep startRef in sync so the IPC handler can call it
  useEffect(() => {
    startRef.current = start;
  });

  const stop = async (): Promise<void> => {
    try {
      await disposerRef.current?.cancel();
    } catch {
      // Let parent surface errors
    }
    disposerRef.current?.dispose?.();
    setLoading(false);
  };

  // Smart auto-scroll: only scrolls when user is at bottom
  const { containerRef: scrollContainerRef, showScrollButton, scrollToBottom, resetAutoScroll } = useAutoScroll([messages, loading]);

  return (
    <div className="w-full h-full bg-background text-foreground overflow-hidden flex flex-col">
      {/* 顶部可拖拽导航栏 - 根据 hideTitleBar 控制显示 */}
      {!hideTitleBar && (
        <DragAbleTitle
          title={
            <div className="flex items-center gap-2 w-full">
              <span>🗨️</span>
              <div className="text-left truncate flex-1">{currentConversation?.title || '未命名会话'}</div>
            </div>
          }
        />
      )}

      {/* 主体：左侧历史列表（可折叠） + 右侧聊天区 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* 左侧：历史会话（可折叠，默认隐藏） */}
        {showHistory && (
          <div className="w-64 border-r shrink-0 flex flex-col bg-muted">
            <div className="p-2 flex items-center gap-1 shrink-0">
              <Button size="icon" variant="outline" className="w-8 h-8 rounded-full" onClick={loadConversations} title="刷新列表">
                <TbRefresh />
              </Button>
              <Button size="sm" className="rounded-full flex-1" onClick={newConversation}>
                <TbPlus />
                新对话
              </Button>
            </div>
            <div className="px-2 pb-2 text-xs text-muted-foreground flex items-center justify-between shrink-0">
              <span>最近会话</span>
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              {loadingConvs && <div className="p-2 text-xs text-muted-foreground">加载中…</div>}
              {!loadingConvs && conversations.length === 0 && <div className="p-2 text-xs text-muted-foreground">暂无会话，点击“新对话”开始</div>}
              <div className="flex flex-col">
                {conversations.map((c) => {
                  const isGenerating = generatingTitleIds.has(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-md mx-1 mb-0.5 ${selectedConvId === c.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                      onClick={() => selectConversation(c.id)}
                    >
                      <div className="flex-1 min-w-0">
                        {isGenerating ? <div className="h-4 rounded shimmer-title" /> : <div className="truncate text-sm">{c.title || '未命名会话'}</div>}
                        <div className={`text-xs ${selectedConvId === c.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`} title={formatDateTime(c.lastMessageAt)}>
                          {c.messagesCount ?? 0} 条消息{c.lastMessageAt ? ` • ${formatRelativeTime(c.lastMessageAt)}` : ''}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button className="opacity-0 group-hover:opacity-100 w-7 h-7 shrink-0" size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                            <TbDots className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="bottom" className="w-40">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              // Copy conversation to clipboard
                              const text = `${c.title || '未命名会话'}`;
                              navigator.clipboard.writeText(text);
                              toast.success('已复制对话标题');
                            }}
                          >
                            <TbShare className="w-4 h-4 mr-2" />
                            分享对话内容
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              // Toggle pin (placeholder)
                              toast.info(c.pinned ? '已取消固定' : '已固定会话');
                            }}
                          >
                            <TbPin className="w-4 h-4 mr-2" />
                            {c.pinned ? '取消固定' : '固定'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openRenameDialog(c.id);
                            }}
                          >
                            <TbEdit className="w-4 h-4 mr-2" />
                            重命名
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteDialog(c.id);
                            }}
                          >
                            <TbTrash className="w-4 h-4 mr-2" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 右侧：聊天窗口 */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          {/* 展开/收起历史按钮 */}
          <div className="absolute top-2 left-2 z-10">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowHistory(!showHistory)} title={showHistory ? '收起历史' : '展开历史'}>
              {showHistory ? <TbChevronRight className="w-4 h-4" /> : <TbHistory className="w-4 h-4" />}
            </Button>
          </div>
          {!messages ||
            (messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <div className="text-center text-lg mb-4">今天有什么能帮到你？</div>
                {/* 固定的常用应用卡片（防止被误删，先放这里） */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 w-full max-w-3xl px-4">
                  {/* 视频转写 */}
                  <button
                    type="button"
                    className="group flex flex-col items-start justify-between rounded-xl border bg-card text-card-foreground p-4 text-left hover:shadow-sm hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">🎙️</div>
                      <div>
                        <div className="font-medium text-sm">视频转写</div>
                        <div className="text-xs text-muted-foreground">将视频语音转换为带时间轴的字幕文本</div>
                      </div>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span>支持多语言</span>
                      <span className="mx-1">·</span>
                      <span>适合长视频整理</span>
                    </div>
                  </button>

                  {/* 字幕翻译 */}
                  <button
                    type="button"
                    className="group flex flex-col items-start justify-between rounded-xl border bg-card text-card-foreground p-4 text-left hover:shadow-sm hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-lg bg-green-500/10 text-green-500">🌐</div>
                      <div>
                        <div className="font-medium text-sm">字幕翻译</div>
                        <div className="text-xs text-muted-foreground">一键翻译现有字幕到多种目标语言</div>
                      </div>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span>保留时间轴</span>
                      <span className="mx-1">·</span>
                      <span>适合多语言发布</span>
                    </div>
                  </button>
                </div>
                <ChatInputWithService loading={loading} onStart={start} onStop={stop} />
              </div>
            ))}
          {messages.length > 0 && (
            <>
              <div ref={scrollContainerRef} className="flex-1 overflow-auto p-2 min-h-0">
                <div className="flex flex-col gap-2">
                  {messages.map((m, i) => (
                    <div key={i} className={`${m.role === 'user' ? 'flex justify-end' : 'flex justify-start'} ${i === messages.length - 1 ? 'mb-24' : ''}`}>
                      <div
                        className={
                          m.role === 'user'
                            ? 'max-w-[80%] rounded-2xl px-3 py-2 break-words bg-primary text-primary-foreground whitespace-pre-wrap'
                            : 'w-full rounded-2xl px-3 py-2 break-words text-foreground'
                        }
                      >
                        {m.role === 'assistant' ? (
                          <>
                            {m.thinking && <ThinkingActivity thinking={m.thinking} isThinking={!!m.isThinking} />}
                            {m.activities && m.activities.length > 0 && <ToolCallActivity activities={m.activities} onUserChoiceSubmit={handleUserChoiceSubmit} />}
                            {m.content || (loading && i === messages.length - 1) ? <ChatMessageRenderer content={m.content || ''} compactCards /> : null}
                            {!m.content && loading && i === messages.length - 1 && (!m.activities || m.activities.length === 0) && (
                              <span className="inline-flex items-center gap-2 text-muted-foreground">
                                <TbLoader2 className="h-4 w-4 animate-spin" /> 正在思考...
                              </span>
                            )}
                          </>
                        ) : (
                          m.content ||
                          (loading && i === messages.length - 1 ? (
                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                              <TbLoader2 className="h-4 w-4 animate-spin" /> 正在思考...
                            </span>
                          ) : (
                            ''
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Scroll-to-bottom button */}
              {showScrollButton && (
                <button
                  className="absolute bottom-24 right-6 z-20 flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-opacity"
                  onClick={() => scrollToBottom(true)}
                  title="滚动到底部"
                >
                  <TbArrowDown className="w-5 h-5" />
                </button>
              )}
              <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                <ChatInputWithService loading={loading} onStart={start} onStop={stop} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* 重命名对话框 */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名对话</DialogTitle>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyRename();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={applyRename}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除对话</AlertDialogTitle>
            <AlertDialogDescription>确定要删除此对话吗？此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteConversation}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
