/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react';
import { TbEdit, TbLoader2, TbPlus, TbRefresh, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatRelativeTime } from '@/lib/time';

import ChatInputBar from './components/ChatInputBar';
import MarkdownMessage from './components/MarkdownMessage';

interface ChatPageProps {
  hideTitleBar?: boolean;
}

export default function ChatPage({ hideTitleBar = false }: ChatPageProps): JSX.Element {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; createdAt?: number }>>([]);
  const [loading, setLoading] = useState(false);
  // Provider/instance/agent are managed inside ChatInputBar now
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const disposerRef = useRef<{ dispose: () => void; cancel: () => Promise<any> } | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const assistantIndexRef = useRef<number>(-1);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(false);

  const currentConversation = useMemo(() => conversations.find((c) => c.id === conversationId) || null, [conversations, conversationId]);

  // Provider/agents/instances fetching moved into ChatInputBar

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
    loadConversations();
  }, []);

  // Select conversation and load its messages
  const selectConversation = async (id: string): Promise<void> => {
    setSelectedConvId(id);
    setConversationId(id);
    try {
      const rows = await window.YUA.ai.listMessages(id, 2000, 0);
      const mapped = (rows || []).map((r: any) => ({ role: r.role, content: r.content, createdAt: r.createdAt }));
      setMessages(mapped);
    } catch {
      // Let parent surface errors
    }
  };

  // Start a brand new conversation (reset state)
  const newConversation = (): void => {
    setSelectedConvId(null);
    setConversationId(undefined);
    setMessages([]);
  };

  // Rename a conversation (prompt)
  const renameConversation = async (id: string): Promise<void> => {
    const current = conversations.find((c) => c.id === id);
    const title = prompt('重命名对话', current?.title || '');
    if (title == null) return;
    await window.YUA.ai.renameConversation(id, title.trim() || '未命名会话');
    await loadConversations();
  };

  // Soft delete a conversation with undo via toast
  const deleteConversation = async (id: string): Promise<void> => {
    const prevSelected = selectedConvId;
    try {
      await window.YUA.ai.deleteConversation(id);
      // Optimistic: remove from list immediately
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (prevSelected === id) newConversation();

      toast.success('已删除会话', {
        description: '你可以在几秒内撤回该操作',
        action: {
          label: '撤回',
          onClick: async () => {
            await window.YUA.ai.restoreConversation(id);
            await loadConversations();
            // If this conversation was focused before, reselect it
            if (prevSelected === id) {
              await selectConversation(id);
            }
          }
        },
        duration: 5000
      });
    } catch (e: any) {
      console.error(e);
      // Let parent surface errors
      toast.error('删除失败');
    }
  };

  const start = async (params: { content: string; providerId: string; instanceId: string; agentId: string }): Promise<void> => {
    const { content, providerId, instanceId, agentId } = params;
    if (!instanceId || !content.trim()) return;

    // 1) 追加用户消息 + 占位的助手消息
    const userMsg = { role: 'user' as const, content, createdAt: Date.now() };
    setMessages((prev) => {
      const next = [...prev, userMsg, { role: 'assistant' as const, content: '', createdAt: Date.now() }];
      assistantIndexRef.current = next.length - 1;
      return next;
    });
    setLoading(true);

    // 2) 构造上下文（包含历史消息 + 新用户消息）
    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt }));

    const disposer = await window.YUA.ai.chatStream({ conversationId, messages: history as any, providerId, providerInstanceId: instanceId, agentId, stream: true }, (ev: any) => {
      if (ev?.type === 'metadata' && ev.data?.conversationId) {
        setConversationId(ev.data.conversationId);
      }
      if (ev?.type === 'delta' && ev.data?.text) {
        const delta: string = ev.data.text;
        setMessages((prev) => {
          const idx = assistantIndexRef.current;
          if (idx < 0 || idx >= prev.length) return prev;
          const copy = prev.slice();
          const m = copy[idx];
          copy[idx] = { ...m, content: (m.content || '') + delta };
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
          copy[idx] = { ...m, content: full, createdAt: ev.data.message.createdAt || m.createdAt };
          return copy;
        });
        setLoading(false);
        // capture conversationId from completed metadata if present
        if (ev.data?.message?.metadata?.conversationId && !conversationId) setConversationId(ev.data.message.metadata.conversationId);
      }
      if (ev?.type === 'message_completed') {
        setLoading(false);
        disposerRef.current?.dispose?.();
        disposerRef.current = null;
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
    });
    disposerRef.current = disposer;
  };

  const stop = async (): Promise<void> => {
    try {
      await disposerRef.current?.cancel();
    } catch {
      // Let parent surface errors
    }
    disposerRef.current?.dispose?.();
    setLoading(false);
  };

  // 新消息或增量时，滚动到底部
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

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

      {/* 嵌入模式下的简洁标题 */}
      {hideTitleBar && (
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h1 className="text-lg font-semibold text-foreground">💬 AI 对话</h1>
        </div>
      )}

      {/* 主体：左侧历史列表 + 右侧聊天区 */}
      <div
        className="flex-1 min-h-0 flex"
        onWheel={() => {
          /* 保留滚动 */
        }}
      >
        {/* 左侧：历史会话 */}
        <div className="w-64 border-r shrink-0 flex flex-col bg-muted">
          <div className="p-2 flex items-center gap-1">
            <Button size="icon" variant="outline" className="w-8 h-8 rounded-full" onClick={loadConversations} title="刷新列表">
              <TbRefresh />
            </Button>
            <Button size="sm" className="rounded-full flex-1" onClick={newConversation}>
              <TbPlus />
              新对话
            </Button>
          </div>
          <div className="px-2 pb-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>最近会话</span>
          </div>
          <div className="flex-1 overflow-auto">
            {loadingConvs && <div className="p-2 text-xs text-muted-foreground">加载中…</div>}
            {!loadingConvs && conversations.length === 0 && <div className="p-2 text-xs text-muted-foreground">暂无会话，点击“新对话”开始</div>}
            <div className="flex flex-col">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 px-2 py-1 cursor-pointer relative ${selectedConvId === c.id ? 'bg-primary text-primary-foreground' : ''}`}
                  onClick={() => selectConversation(c.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm">{c.title || '未命名会话'}</div>
                    <div className="text-xs text-muted-foreground" title={formatDateTime(c.lastMessageAt)}>
                      {c.messagesCount ?? 0} 条消息{c.lastMessageAt ? ` • ${formatRelativeTime(c.lastMessageAt)}` : ''}
                    </div>
                  </div>
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <Button
                      className="opacity-0 group-hover:opacity-100 w-8 h-8"
                      size="icon"
                      variant={'outline'}
                      title="重命名"
                      onClick={(e) => {
                        e.stopPropagation();
                        renameConversation(c.id);
                      }}
                    >
                      <TbEdit className="w-4 h-4" />
                    </Button>
                    <Button
                      className="opacity-0 group-hover:opacity-100 w-8 h-8"
                      size="icon"
                      variant={'destructive'}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(c.id);
                      }}
                    >
                      <TbTrash className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧：聊天窗口 */}
        <div className="flex-1 min-w-0 overflow-auto p-2">
          {!messages ||
            (messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <div className="text-center text-lg">今天有什么能帮到你？</div>
                <ChatInputBar loading={loading} onStart={start} onStop={stop} />
              </div>
            ))}
          <div className="flex flex-col gap-2">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={'max-w-[80%] rounded-2xl px-3 py-2 break-words ' + (m.role === 'user' ? 'bg-primary text-primary-foreground whitespace-pre-wrap' : 'bg-muted text-foreground')}>
                  {m.role === 'assistant' ? (
                    <MarkdownMessage content={m.content || ''} />
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
            <div ref={listEndRef} />
          </div>
          {messages.length > 0 && <ChatInputBar loading={loading} onStart={start} onStop={stop} />}
        </div>
      </div>
    </div>
  );
}
