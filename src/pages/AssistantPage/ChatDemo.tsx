import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import DragAbleTitle from '@/components/common/DragAbleTitle';
import { TbSend, TbLoader2, TbTrash, TbRefresh, TbEdit, TbPlus } from 'react-icons/tb';
import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownMessage from '@/components/common/MarkdownMessage';
import { formatRelativeTime, formatDateTime } from '@/lib/time';

export default function ChatDemo() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; createdAt?: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [providerId, setProviderId] = useState('openai');
  // providerId -> instances[]
  const [instancesMap, setInstancesMap] = useState<Record<string, any[]>>({});
  const [instanceId, setInstanceId] = useState<string>('');
  const [agentId, setAgentId] = useState('basic');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const disposerRef = useRef<{ dispose: () => void; cancel: () => Promise<any> } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const assistantIndexRef = useRef<number>(-1);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const currentConversation = useMemo(() => conversations.find(c => c.id === conversationId) || null, [conversations, conversationId]);

  useEffect(() => {
    (async () => {
      try { setProviders(await window.YUA.ai.getProviders()); } catch { }
      try { setAgents(await window.YUA.ai.getAgents()); } catch { }
    })();
  }, []);

  // Prefetch instances for all providers once provider list is ready
  useEffect(() => {
    (async () => {
      if (!providers?.length) return;
      try {
        const entries = await Promise.all(
          providers.map(async (p) => {
            try {
              const list = await window.YUA.ai.listInstances(p.id);
              return [p.id, list || []] as const;
            } catch {
              return [p.id, []] as const;
            }
          })
        );
        const map = Object.fromEntries(entries);
        setInstancesMap(map);
        // If current provider has instances and no instance selected yet, keep empty to use provider directly by default
      } catch { /* noop */ }
    })();
  }, [providers]);

  // Load conversations list
  const loadConversations = async () => {
    setLoadingConvs(true);
    try {
      const rows = await window.YUA.ai.listConversations({ includeDeleted: false, limit: 200 });
      setConversations(rows || []);
    } catch { }
    setLoadingConvs(false);
  };
  useEffect(() => { loadConversations(); }, []);

  // Select conversation and load its messages
  const selectConversation = async (id: string) => {
    setSelectedConvId(id);
    setConversationId(id);
    try {
      const rows = await window.YUA.ai.listMessages(id, 2000, 0);
      const mapped = (rows || []).map((r: any) => ({ role: r.role, content: r.content, createdAt: r.createdAt }));
      setMessages(mapped);
    } catch { }
  };

  // Start a brand new conversation (reset state)
  const newConversation = () => {
    setSelectedConvId(null);
    setConversationId(undefined);
    setMessages([]);
  };

  // Rename a conversation (prompt)
  const renameConversation = async (id: string) => {
    const current = conversations.find(c => c.id === id);
    const title = prompt('重命名对话', current?.title || '');
    if (title == null) return;
    await window.YUA.ai.renameConversation(id, title.trim() || '未命名会话');
    await loadConversations();
  };

  // Inline edit current title
  const saveInlineTitle = async () => {
    if (!conversationId) return setEditingTitle(false);
    const val = titleDraft.trim();
    await window.YUA.ai.renameConversation(conversationId, val || '未命名会话');
    setEditingTitle(false);
    await loadConversations();
  };

  // Soft delete a conversation with undo via toast
  const deleteConversation = async (id: string) => {
    const prevSelected = selectedConvId;
    try {
      await window.YUA.ai.deleteConversation(id);
      // Optimistic: remove from list immediately
      setConversations(prev => prev.filter(c => c.id !== id));
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
          },
        },
        duration: 5000,
      });
    } catch (e) {
      toast.error('删除失败');
    }
  };

  const start = async () => {
    if (!instanceId) return;
    const content = input.trim();
    if (!content) return;

    // 1) 追加用户消息 + 占位的助手消息
    const userMsg = { role: 'user' as const, content, createdAt: Date.now() };
    setMessages(prev => {
      const next = [...prev, userMsg, { role: 'assistant' as const, content: '', createdAt: Date.now() }];
      assistantIndexRef.current = next.length - 1;
      return next;
    });
    setInput('');
    setLoading(true);

    // 2) 构造上下文（包含历史消息 + 新用户消息）
    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content, createdAt: m.createdAt }));

    const disposer = await window.YUA.ai.chatStream(
      { conversationId, messages: history as any, providerId, providerInstanceId: instanceId, agentId, stream: true },
      (ev: any) => {
        if (ev?.type === 'metadata' && ev.data?.conversationId) {
          setConversationId(ev.data.conversationId);
        }
        if (ev?.type === 'delta' && ev.data?.text) {
          const delta: string = ev.data.text;
          setMessages(prev => {
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
          setMessages(prev => {
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
        if (ev?.type === 'done') {
          // 兼容 dummy provider 的 done 事件
          setLoading(false);
          disposerRef.current?.dispose?.();
          disposerRef.current = null;
        }
        if (ev?.type === 'error') {
          setMessages(prev => {
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

  const stop = async () => {
    try { await disposerRef.current?.cancel(); } catch { }
    disposerRef.current?.dispose?.();
    setLoading(false);
  };

  // 文本域自动高度（单行起步，随输入增长）
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'; // 最大 200px，超出可滚动
  }, [input]);

  // 新消息或增量时，滚动到底部
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  return (
    <div className="w-full h-full bg-background text-foreground overflow-hidden flex flex-col">
      {/* 顶部可拖拽导航栏 */}
      <DragAbleTitle title={
        <div className="flex items-center gap-2 w-full">
          <span>🗨️</span>
          {!editingTitle ? (
            <button className="text-left truncate flex-1 hover:underline" title="点击编辑标题" onClick={() => { setEditingTitle(true); setTitleDraft(currentConversation?.title || ''); }}>
              {currentConversation?.title || '未命名会话'}
            </button>
          ) : (
            <form className="flex-1 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); saveInlineTitle(); }}>
              <input
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                autoFocus
                className="bg-background border px-2 py-1 rounded w-[420px] max-w-[60vw]"
              />
              <Button size="sm" type="submit">保存</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => { setEditingTitle(false); }}>取消</Button>
            </form>
          )}
          <span className="text-xs text-muted-foreground whitespace-nowrap" title={formatDateTime(currentConversation?.lastMessageAt)}>
            {formatRelativeTime(currentConversation?.lastMessageAt)}
          </span>
        </div>
      } />

      {/* 主体：左侧历史列表 + 右侧聊天区 */}
      <div className="flex-1 min-h-0 flex" onWheel={() => { /* 保留滚动 */ }}>
        {/* 左侧：历史会话 */}
        <div className="w-64 border-r shrink-0 flex flex-col">
          <div className="p-2 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={newConversation} className="h-7 text-xs"><TbPlus className="w-4 h-4 mr-1" />新对话</Button>
            <Button size="sm" variant="ghost" onClick={loadConversations} className="h-7 text-xs" title="刷新列表"><TbRefresh className="w-4 h-4" /></Button>
          </div>
          <div className="px-2 pb-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>最近会话</span>
            <span className="inline-flex items-center gap-1">
              <span>排序</span>
              <span className="font-mono">lastMessageAt ↓</span>
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            {loadingConvs && <div className="p-2 text-xs text-muted-foreground">加载中…</div>}
            {!loadingConvs && conversations.length === 0 && (
              <div className="p-2 text-xs text-muted-foreground">暂无会话，点击“新对话”开始</div>
            )}
            <div className="flex flex-col">
              {conversations.map((c) => (
                <div key={c.id} className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/50 ${selectedConvId === c.id ? 'bg-muted' : ''}`} onClick={() => selectConversation(c.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm">{c.title || '未命名会话'}</div>
                    <div className="text-[11px] text-muted-foreground" title={formatDateTime(c.lastMessageAt)}>
                      {(c.messagesCount ?? 0)} 条 • {c.providerId || '-'}{c.providerInstanceId ? `/${c.providerInstanceId}` : ''}
                      {c.lastMessageAt ? ` • ${formatRelativeTime(c.lastMessageAt)}` : ''}
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted" title="重命名" onClick={(e) => { e.stopPropagation(); renameConversation(c.id); }}>
                    <TbEdit className="w-4 h-4" />
                  </button>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted" title="删除" onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}>
                    <TbTrash className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧：聊天窗口 */}
        <div className="flex-1 min-w-0 overflow-auto p-3">
          <div className="flex flex-col gap-2">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={
                  'max-w-[80%] rounded-2xl px-3 py-2 whitespace-pre-wrap break-words ' +
                  (m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')
                }>
                  {m.role === 'assistant' ? (
                    <MarkdownMessage content={m.content || ''} />
                  ) : (
                    m.content || (loading && i === messages.length - 1 ? (
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <TbLoader2 className="h-4 w-4 animate-spin" /> 正在思考...
                      </span>
                    ) : '')
                  )}
                </div>
              </div>
            ))}
            <div ref={listEndRef} />
          </div>
        </div>
      </div>

      <div className="relative border rounded-md bg-background box-border my-2 mx-2 w-[calc(100%-1rem)]">
        {/* 多行输入框，右下角预留按钮空间 */}
        <Textarea
          ref={textareaRef}
          rows={1}
          className="resize-none min-h-0 max-h-52 overflow-auto pr-24 pb-16 box-border"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="输入消息，Enter 发送（需先选择实例），Shift+Enter 换行"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!loading && instanceId) start();
            }
          }}
        />

        {/* 右下角发送/停止按钮 */}
        {!loading ? (
          <Button
            onClick={start}
            disabled={!input.trim() || !instanceId}
            className="absolute bottom-3 right-3 rounded-full h-9 w-9 p-0"
            aria-label="发送"
          >
            <TbSend className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={stop}
            variant={"destructive"}
            className="absolute bottom-3 right-3 rounded-full h-9 w-9 p-0"
            aria-label="停止"
            title="停止"
          >
            <TbLoader2 className="h-4 w-4 animate-spin" />
          </Button>
        )}

        {/* 底部内嵌操作栏（与输入框同框） */}
        <div className="absolute bottom-3 left-3 right-16 flex items-center gap-1.5 overflow-x-auto">
          <div className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-7 px-2 text-[11px] w-auto min-w-[220px] border-0 bg-muted/30 hover:bg-muted/50 rounded-md flex items-center justify-between"
                  aria-label="选择 服务商 · 实例"
                >
                  <span className="truncate text-left">
                    {(() => {
                      if (!instanceId) return '选择 服务商 · 实例';
                      const provider = providers.find(p => p.id === providerId);
                      const providerLabel = provider?.label || providerId || '服务商';
                      const currentInstances = instancesMap[providerId] || [];
                      const instance = currentInstances.find(it => it.id === instanceId);
                      const instanceLabel = instance?.name || instanceId;
                      return `${providerLabel} · ${instanceLabel}`;
                    })()}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="text-xs min-w-[220px]">
                <DropdownMenuLabel>选择 服务商 · 实例</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {providers.map((p) => {
                  const list = instancesMap[p.id] || [];
                  return (
                    <DropdownMenuSub key={p.id}>
                      <DropdownMenuSubTrigger>{p.label}</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="text-xs">
                        {list.length === 0 ? (
                          <DropdownMenuItem
                            onSelect={async () => {
                              try { await window.YUA.window.openWindow('settings' as any, { category: 'ai', aiProviderId: p.id }); } catch { }
                            }}
                          >
                            未配置实例，去配置…
                          </DropdownMenuItem>
                        ) : (
                          list.map((it) => (
                            <DropdownMenuItem
                              key={it.id}
                              onSelect={() => {
                                setProviderId(p.id);
                                setInstanceId(it.id);
                              }}
                            >
                              {it.name || it.id}
                            </DropdownMenuItem>
                          ))
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="shrink-0">
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="h-7 px-2 text-[11px] w-auto min-w-[120px] border-0 bg-muted/30 hover:bg-muted/50 rounded-md">
                <SelectValue placeholder="选择 Agent" />
              </SelectTrigger>
              <SelectContent className="text-xs">
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
