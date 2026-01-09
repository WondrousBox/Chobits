import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TbChevronDown,
  TbClock,
  TbDotsVertical,
  TbLoader2,
  TbMicrophone,
  TbPhoto,
  TbPlus,
  TbPlayerStop,
  TbWorld,
  TbAt
} from 'react-icons/tb';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatRelativeTime } from '@/lib/time';

// 消息类型
interface Message {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
}

// 会话类型
interface Conversation {
  id: string;
  title: string;
  lastMessageAt?: number;
  messagesCount?: number;
}

// Provider 实例类型
interface ProviderInstance {
  id: string;
  name: string;
  providerId: string;
}

// Agent 类型
interface Agent {
  id: string;
  label: string;
}

// Provider 类型
interface Provider {
  id: string;
  name: string;
}

interface AIChatSidebarProps {
  onClose: () => void;
}

// Markdown 消息渲染组件
function MarkdownMessage({ content }: { content: string }): JSX.Element {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

const AIChatSidebar: React.FC<AIChatSidebarProps> = ({ onClose }) => {
  // 消息状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');

  // Provider/Instance/Agent 状态
  const [providers, setProviders] = useState<Provider[]>([]);
  const [instancesMap, setInstancesMap] = useState<Record<string, ProviderInstance[]>>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providerId, setProviderId] = useState<string>(() => localStorage.getItem('ai-sidebar.providerId') || 'openai');
  const [instanceId, setInstanceId] = useState<string>(() => localStorage.getItem('ai-sidebar.instanceId') || '');
  const [agentId, setAgentId] = useState<string>(() => localStorage.getItem('ai-sidebar.agentId') || 'basic');

  // 会话状态
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const assistantIndexRef = useRef<number>(-1);
  const disposerRef = useRef<{ dispose: () => void; cancel: () => Promise<any> } | null>(null);
  // 用于在异步回调中获取最新的 providerId（避免闭包陷阱）
  const providerIdRef = useRef<string>(providerId);

  // 保持 ref 与 state 同步
  useEffect(() => {
    providerIdRef.current = providerId;
  }, [providerId]);

  // 当前选中的实例信息
  const currentInstance = useMemo(() => {
    const instances = instancesMap[providerId] || [];
    return instances.find((i) => i.id === instanceId);
  }, [instancesMap, providerId, instanceId]);

  // 当前选中的 Agent
  const currentAgent = useMemo(() => {
    return agents.find((a) => a.id === agentId);
  }, [agents, agentId]);

  // 持久化选择
  useEffect(() => {
    localStorage.setItem('ai-sidebar.providerId', providerId);
  }, [providerId]);
  useEffect(() => {
    localStorage.setItem('ai-sidebar.instanceId', instanceId);
  }, [instanceId]);
  useEffect(() => {
    localStorage.setItem('ai-sidebar.agentId', agentId);
  }, [agentId]);

  // 加载 providers 和 instances
  const loadProvidersAndInstances = useCallback(async (): Promise<void> => {
    try {
      const provList = await window.YUA.ai.getProviders();
      setProviders(provList || []);

      const map: Record<string, ProviderInstance[]> = {};
      for (const p of provList || []) {
        const instances = await window.YUA.ai.getProviderInstances(p.id);
        map[p.id] = instances || [];
      }
      setInstancesMap(map);

      // 如果当前 instanceId 无效，选择第一个可用的
      // 使用 providerIdRef 获取最新的 providerId（避免闭包陷阱）
      setInstanceId((currentInstanceId) => {
        const currentInstances = map[providerIdRef.current] || [];
        if (currentInstances.length > 0 && !currentInstances.some((i) => i.id === currentInstanceId)) {
          return currentInstances[0].id;
        }
        return currentInstanceId;
      });
    } catch (e) {
      console.warn('加载 providers 失败:', e);
    }
  }, []);

  // 加载 agents
  const loadAgents = useCallback(async (): Promise<void> => {
    try {
      const agentList = await window.YUA.ai.getAgents();
      setAgents(agentList || []);
      // 如果当前 agentId 无效，选择第一个
      setAgentId((currentAgentId) => {
        if (agentList?.length > 0 && !agentList.some((a: Agent) => a.id === currentAgentId)) {
          return agentList[0].id;
        }
        return currentAgentId;
      });
    } catch (e) {
      console.warn('加载 agents 失败:', e);
    }
  }, []);

  // 加载会话列表
  const loadConversations = useCallback(async (): Promise<void> => {
    setLoadingConvs(true);
    try {
      const rows = await window.YUA.ai.listConversations({ includeDeleted: false, limit: 50 });
      setConversations(rows || []);
    } catch (e) {
      console.warn('加载会话列表失败:', e);
    }
    setLoadingConvs(false);
  }, []);

  // 选择会话
  const selectConversation = async (id: string): Promise<void> => {
    setConversationId(id);
    setShowHistory(false);
    try {
      const rows = await window.YUA.ai.listMessages(id, 2000, 0);
      const mapped = (rows || []).map((r: any) => ({
        role: r.role,
        content: r.content,
        createdAt: r.createdAt
      }));
      setMessages(mapped);
    } catch (e) {
      console.warn('加载会话消息失败:', e);
    }
  };

  // 新建会话
  const newConversation = (): void => {
    setConversationId(undefined);
    setMessages([]);
    setShowHistory(false);
  };

  // 初始化加载
  useEffect(() => {
    loadProvidersAndInstances();
    loadAgents();
    loadConversations();
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  // Textarea 自动高度
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 120;
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
  }, [inputText]);

  // 发送消息
  const handleSend = async (): Promise<void> => {
    const content = inputText.trim();
    if (!content || loading || !instanceId) {
      if (!instanceId) {
        toast.error('请先选择一个模型实例');
      }
      return;
    }

    // 添加用户消息和占位的助手消息
    const userMsg: Message = { role: 'user', content, createdAt: Date.now() };
    setMessages((prev) => {
      const next = [...prev, userMsg, { role: 'assistant' as const, content: '', createdAt: Date.now() }];
      assistantIndexRef.current = next.length - 1;
      return next;
    });
    setInputText('');
    setLoading(true);

    // 构建历史消息
    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt
    }));

    try {
      const disposer = await window.YUA.ai.chatStream(
        {
          conversationId,
          messages: history as any,
          providerId,
          providerInstanceId: instanceId,
          agentId,
          stream: true
        },
        (ev: any) => {
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
          }
          if (ev?.type === 'message_completed') {
            setLoading(false);
            disposerRef.current?.dispose?.();
            disposerRef.current = null;
            // 刷新会话列表
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
    } catch (e) {
      console.error('发送消息失败:', e);
      setLoading(false);
      toast.error('发送消息失败');
    }
  };

  // 停止生成
  const handleStop = async (): Promise<void> => {
    try {
      await disposerRef.current?.cancel();
    } catch {
      // 忽略错误
    }
    disposerRef.current?.dispose?.();
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col bg-background border-l">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        {/* 左侧：New Chat 标签 */}
        <button
          className="px-3 py-1 text-sm font-medium bg-muted hover:bg-muted/80 rounded-md border border-border transition-colors"
          onClick={newConversation}
        >
          New Chat
        </button>
        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={newConversation} title="新对话">
            <TbPlus className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setShowHistory(!showHistory)} title="历史记录">
            <TbClock className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="更多">
                <TbDotsVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onClose}>关闭面板</DropdownMenuItem>
              <DropdownMenuItem onClick={loadConversations}>刷新会话</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 消息列表 / 历史会话 */}
      <div className="flex-1 overflow-auto min-h-0">
        {showHistory ? (
          // 历史会话列表
          <div className="p-4">
            <div className="text-sm font-medium mb-3">历史会话</div>
            {loadingConvs ? (
              <div className="text-xs text-muted-foreground">加载中...</div>
            ) : conversations.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无历史会话</div>
            ) : (
              <div className="flex flex-col gap-1">
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => selectConversation(c.id)}
                  >
                    <div className="text-sm truncate">{c.title || '未命名会话'}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.messagesCount ?? 0} 条消息
                      {c.lastMessageAt ? ` · ${formatRelativeTime(c.lastMessageAt)}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : messages.length === 0 ? (
          // 空状态 - 什么都不显示，保持空白
          <div className="h-full" />
        ) : (
          // 消息列表
          <div className="flex flex-col gap-3 p-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    'max-w-[90%] rounded-xl px-3 py-2 ' +
                    (m.role === 'user'
                      ? 'bg-primary text-primary-foreground text-sm'
                      : 'bg-muted text-foreground')
                  }
                >
                  {m.role === 'assistant' ? (
                    m.content ? (
                      <MarkdownMessage content={m.content} />
                    ) : loading && i === messages.length - 1 ? (
                      <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                        <TbLoader2 className="h-4 w-4 animate-spin" /> 正在思考...
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStop();
                          }}
                          className="ml-2 p-1 rounded hover:bg-background/50 transition-colors"
                          title="停止生成"
                        >
                          <TbPlayerStop className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{m.content}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={listEndRef} />
          </div>
        )}
      </div>

      {/* 底部输入区域 */}
      <div className="px-4 py-3 shrink-0 border-t">
        <div className="border border-border rounded-lg bg-background">
          {/* 输入框 */}
          <textarea
            ref={textareaRef}
            rows={1}
            className="w-full resize-none min-h-[40px] max-h-[120px] px-3 py-2.5 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/60"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Plan, @ for context, / for commands"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!loading) handleSend();
              }
            }}
          />
          {/* 工具栏 */}
          <div className="flex items-center justify-between px-2 py-1.5 border-t border-border">
            {/* 左侧：Agent 和模型选择 */}
            <div className="flex items-center gap-1">
              {/* Agent 选择 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded transition-colors">
                    <span className="text-primary">∞</span>
                    <span>{currentAgent?.label || 'Agent'}</span>
                    <TbChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[120px]">
                  {agents.map((a) => (
                    <DropdownMenuItem key={a.id} onClick={() => setAgentId(a.id)}>
                      {a.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 模型选择 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded transition-colors">
                    <span>{currentInstance?.name || '选择模型'}</span>
                    <TbChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[160px]">
                  {providers.map((p) => {
                    const instances = instancesMap[p.id] || [];
                    if (instances.length === 0) return null;
                    return (
                      <React.Fragment key={p.id}>
                        <div className="px-2 py-1 text-xs text-muted-foreground font-medium">{p.name}</div>
                        {instances.map((inst) => (
                          <DropdownMenuItem
                            key={inst.id}
                            onClick={() => {
                              setProviderId(p.id);
                              setInstanceId(inst.id);
                            }}
                          >
                            {inst.name}
                          </DropdownMenuItem>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* 右侧：功能图标 */}
            <div className="flex items-center gap-0.5">
              <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title="@提及">
                <TbAt className="w-4 h-4" />
              </button>
              <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title="联网搜索">
                <TbWorld className="w-4 h-4" />
              </button>
              <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title="上传图片">
                <TbPhoto className="w-4 h-4" />
              </button>
              <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title="语音输入">
                <TbMicrophone className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIChatSidebar;
