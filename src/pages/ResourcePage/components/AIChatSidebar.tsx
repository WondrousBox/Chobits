import { getChatMessageUsage, sumTokenUsage } from '@packages/ai/message-usage';
import { extractThinkingTextFromMetadata } from '@packages/ai/thinking-content';
import type { TokenUsage } from '@packages/ai/types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbAt, TbClock, TbDotsVertical, TbLoader2, TbPhoto, TbPlayerStop, TbPlus, TbWorld } from 'react-icons/tb';
import { toast } from 'sonner';

import {
  appendTextPart,
  appendThinkingPart,
  appendToolPart,
  AssistantMessageTimeline,
  ChatAgentSelect,
  ChatFooterActions,
  type ChatMessageDisplayPart,
  ChatTokenUsage,
  CodingWorkspaceButton,
  finalizeTimelineMessage,
  hasTimelineContent,
  mergeTranscriptWithInput,
  readDisplayPartsFromMetadata,
  type ToolActivity,
  UnifiedChatInput,
  type UnifiedChatInputHandle,
  updateToolPart,
  useSpeechInput
} from '@/components/chat';
import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { resolveModelFirstSelection } from '@/lib/ai-model-first';
import { guideChatApiConfigIfNeeded } from '@/lib/chat-api-config-guide';
import { buildExplicitSkillInvocationInput } from '@/lib/chat-explicit-skill-invocation';
import { pickCodingWorkspace } from '@/lib/coding-workspace';
import { formatRelativeTime } from '@/lib/time';
import { speakToolResultSpeech } from '@/lib/tool-speech';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
  activities?: ToolActivity[];
  displayParts?: ChatMessageDisplayPart[];
  thinking?: string;
  isThinking?: boolean;
  usage?: TokenUsage;
}

interface Conversation {
  id: string;
  title: string;
  lastMessageAt?: number;
  messagesCount?: number;
}

interface Agent {
  id: string;
  label: string;
}

interface AIChatSidebarProps {
  onClose: () => void;
  workspaceId?: string;
}

const STORAGE_KEYS = {
  agentId: 'ai-sidebar.agentId',
  codingWorkspaceLabel: 'ai-sidebar.codingWorkspaceLabel',
  codingWorkspaceRoot: 'ai-sidebar.codingWorkspaceRoot',
  modelId: 'ai-sidebar.modelId',
  presetId: 'ai-sidebar.presetId',
  providerId: 'ai-sidebar.providerId'
};

const AIChatSidebar: React.FC<AIChatSidebarProps> = ({ onClose, workspaceId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');

  const [agents, setAgents] = useState<Agent[]>([]);
  const [providerId, setProviderId] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.providerId) || 'openai');
  const [modelId, setModelId] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.modelId) || '');
  const [presetId, setPresetId] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.presetId) || '');
  const [agentId, setAgentId] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.agentId) || 'assistant');
  const [codingWorkspaceRoot, setCodingWorkspaceRoot] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.codingWorkspaceRoot) || '');
  const [codingWorkspaceLabel, setCodingWorkspaceLabel] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.codingWorkspaceLabel) || '');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const inputRef = useRef<UnifiedChatInputHandle>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const assistantIndexRef = useRef<number>(-1);
  const disposerRef = useRef<{ dispose: () => void; cancel: () => Promise<any> } | null>(null);

  const isCoder = agentId === 'coder';
  const conversationUsage = React.useMemo(() => sumTokenUsage(messages), [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.providerId, providerId);
  }, [providerId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.modelId, modelId);
  }, [modelId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.presetId, presetId);
  }, [presetId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.agentId, agentId);
  }, [agentId]);

  useEffect(() => {
    if (codingWorkspaceRoot) {
      localStorage.setItem(STORAGE_KEYS.codingWorkspaceRoot, codingWorkspaceRoot);
    } else {
      localStorage.removeItem(STORAGE_KEYS.codingWorkspaceRoot);
    }
  }, [codingWorkspaceRoot]);

  useEffect(() => {
    if (codingWorkspaceLabel) {
      localStorage.setItem(STORAGE_KEYS.codingWorkspaceLabel, codingWorkspaceLabel);
    } else {
      localStorage.removeItem(STORAGE_KEYS.codingWorkspaceLabel);
    }
  }, [codingWorkspaceLabel]);

  const loadAgents = useCallback(async (): Promise<void> => {
    try {
      const agentList = await window.YUA.ai.getAgents();
      setAgents(agentList || []);
      setAgentId((currentAgentId) => {
        if (agentList?.length > 0 && !agentList.some((agent: Agent) => agent.id === currentAgentId)) {
          return agentList[0].id;
        }
        return currentAgentId;
      });
    } catch (error) {
      console.warn('Failed to load agents:', error);
    }
  }, []);

  const loadConversations = useCallback(async (): Promise<void> => {
    setLoadingConvs(true);
    try {
      const rows = await window.YUA.ai.listConversations({ includeDeleted: false, limit: 50 });
      setConversations(
        (rows || []).map((row: any) => ({
          id: row.id,
          title: row.title || '',
          lastMessageAt: row.lastMessageAt,
          messagesCount: row.messagesCount
        }))
      );
    } catch (error) {
      console.warn('Failed to load conversations:', error);
    }
    setLoadingConvs(false);
  }, []);

  const selectConversation = async (id: string): Promise<void> => {
    setConversationId(id);
    setShowHistory(false);
    try {
      const rows = await window.YUA.ai.listMessages(id, 2000, 0);
      const mapped = (rows || []).map((row: any) => {
        let activities: ToolActivity[] | undefined;
        const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : row.metadata;
        const usage: TokenUsage | undefined = getChatMessageUsage({ metadata: meta });
        const thinking = extractThinkingTextFromMetadata(meta);
        if (meta && Array.isArray(meta?.toolCalls)) {
          activities = meta.toolCalls.map((tc: any) => {
            const base: ToolActivity = { callId: tc.callId, name: tc.name, args: tc.args, status: 'done' as const, label: tc.label, display: tc.display, result: tc.result };
            if (tc.name === 'askUserTool' || tc.name === 'ask-user') {
              const parsedArgs = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
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
        const displayParts = readDisplayPartsFromMetadata(meta, activities);
        return {
          role: row.role,
          content: row.content,
          createdAt: row.createdAt,
          ...(activities ? { activities } : {}),
          ...(displayParts ? { displayParts } : {}),
          ...(thinking ? { thinking, isThinking: false } : {}),
          ...(usage ? { usage } : {})
        };
      });
      setMessages(mapped);
    } catch (error) {
      console.warn('Failed to load conversation messages:', error);
    }
  };

  const newConversation = (): void => {
    setConversationId(undefined);
    setMessages([]);
    setShowHistory(false);
  };

  const handlePickWorkspace = async (): Promise<void> => {
    const workspace = await pickCodingWorkspace(codingWorkspaceRoot);
    if (!workspace) {
      return;
    }

    setCodingWorkspaceRoot(workspace.root);
    setCodingWorkspaceLabel(workspace.label);
  };

  const clearCodingWorkspace = (): void => {
    setCodingWorkspaceRoot('');
    setCodingWorkspaceLabel('');
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAgents();
      void loadConversations();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAgents, loadConversations]);

  useEffect(() => {
    void guideChatApiConfigIfNeeded({ providerId, preferredPresetId: presetId, trigger: 'sidebar-open' });
  }, [presetId, providerId]);

  useEffect(() => {
    const dispose = window.YUA.ai.onConversationTitleUpdated((data) => {
      if (data.status === 'generating') return;
      if (data.title) {
        setConversations((prev) => prev.map((conversation) => (conversation.id === data.conversationId ? { ...conversation, title: data.title || conversation.title } : conversation)));
        return;
      }
      void loadConversations();
    });

    return () => dispose();
  }, [loadConversations]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const handleTranscriptFinal = useCallback((text: string): void => {
    setInputText((prev) => mergeTranscriptWithInput(prev, text));
    inputRef.current?.focus();
  }, []);

  const speechInput = useSpeechInput({
    onTranscriptFinal: handleTranscriptFinal
  });

  const handleSend = async (nextContent?: string): Promise<void> => {
    const content = (nextContent ?? inputText).trim();
    if (!content || loading || !providerId || !modelId) {
      if (!providerId || !modelId) {
        toast.error('请先选择一个模型');
      }
      return;
    }

    if (isCoder && !codingWorkspaceRoot) {
      toast.error('代码助手需要先选择项目目录');
      return;
    }

    const resolvedSelection = await resolveModelFirstSelection({
      providerId,
      modelId,
      preferredPresetId: presetId
    });

    if (!resolvedSelection) {
      void guideChatApiConfigIfNeeded({ providerId, preferredPresetId: presetId, trigger: 'sidebar-send', force: true });
      toast.error('当前服务商还没有可用预设，请先完成 AI 配置');
      return;
    }

    if (resolvedSelection.providerPresetId !== presetId) {
      setPresetId(resolvedSelection.providerPresetId);
    }

    const userMessage: Message = { role: 'user', content, createdAt: Date.now() };
    setMessages((prev) => {
      const next = [...prev, userMessage, { role: 'assistant' as const, content: '', createdAt: Date.now() }];
      assistantIndexRef.current = next.length - 1;
      return next;
    });
    setInputText('');
    setLoading(true);

    const history = [...messages, userMessage].map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt
    }));
    const explicitSkillInvocation = buildExplicitSkillInvocationInput(agentId, content);

    try {
      const disposer = await window.YUA.ai.chatStream(
        {
          conversationId,
          messages: history as any,
          providerId: resolvedSelection.providerId,
          providerPresetId: resolvedSelection.providerPresetId,
          agentId,
          stream: true,
          extras: {
            model: resolvedSelection.modelId,
            ...(explicitSkillInvocation ? { explicitSkillInvocation } : {}),
            ...(workspaceId ? { workspaceId } : {}),
            ...(isCoder && codingWorkspaceRoot
              ? {
                codingWorkspaceRoot,
                codingWorkspaceLabel: codingWorkspaceLabel || undefined
              }
              : {})
          }
        },
        (event: any) => {
          if (event?.type === 'metadata' && event.data?.conversationId) {
            const nextConversationId = event.data.conversationId;
            const nextTitle = typeof event.data.title === 'string' ? event.data.title.trim() : '';
            setConversationId(nextConversationId);
            if (nextTitle) {
              setConversations((prev) => {
                const existing = prev.find((conversation) => conversation.id === nextConversationId);
                if (existing) {
                  return prev.map((conversation) => (conversation.id === nextConversationId ? { ...conversation, title: existing.title || nextTitle } : conversation));
                }
                return [{ id: nextConversationId, title: nextTitle, messagesCount: 1, lastMessageAt: userMessage.createdAt }, ...prev];
              });
            }
          }

          if (event?.type === 'tool_call' && event.data) {
            setMessages((prev) => {
              const idx = assistantIndexRef.current;
              if (idx < 0 || idx >= prev.length) return prev;
              const copy = prev.slice();
              const m = copy[idx];
              const activity: ToolActivity = { callId: event.data.callId, name: event.data.name, args: event.data.args, status: 'calling', label: event.data.label, display: event.data.display };
              copy[idx] = appendToolPart(m, activity);
              return copy;
            });
          }

          if (event?.type === 'tool_result' && event.data) {
            speakToolResultSpeech(event.data);
            setMessages((prev) => {
              const idx = assistantIndexRef.current;
              if (idx < 0 || idx >= prev.length) return prev;
              const copy = prev.slice();
              const m = copy[idx];
              copy[idx] = updateToolPart(m, event.data.callId, (activity) => ({ ...activity, status: 'done' as const, result: event.data.result }));
              return copy;
            });
          }

          if (event?.type === 'tool_progress' && event.data) {
            setMessages((prev) => {
              const idx = assistantIndexRef.current;
              if (idx < 0 || idx >= prev.length) return prev;
              const copy = prev.slice();
              const m = copy[idx];
              copy[idx] = updateToolPart(m, event.data.callId, (activity) => ({ ...activity, progress: event.data.progress, progressMessage: event.data.message }));
              return copy;
            });
          }

          if (event?.type === 'user_choice_request' && event.data) {
            setMessages((prev) => {
              const idx = assistantIndexRef.current;
              if (idx < 0 || idx >= prev.length) return prev;
              const copy = prev.slice();
              const m = copy[idx];
              copy[idx] = updateToolPart(m, event.data.toolCallId, (activity) => ({ ...activity, choiceRequest: event.data }));
              return copy;
            });
          }

          if (event?.type === 'thinking_delta' && event.data?.text) {
            setMessages((prev) => {
              const idx = assistantIndexRef.current;
              if (idx < 0 || idx >= prev.length) return prev;
              const copy = prev.slice();
              const m = copy[idx];
              copy[idx] = appendThinkingPart(m, event.data.text);
              return copy;
            });
          }

          if (event?.type === 'delta' && event.data?.text) {
            const delta = String(event.data.text);
            setMessages((prev) => {
              const idx = assistantIndexRef.current;
              if (idx < 0 || idx >= prev.length) return prev;

              const copy = prev.slice();
              const message = copy[idx];
              copy[idx] = appendTextPart(message, delta);
              return copy;
            });
          }

          if (event?.type === 'message_completed' && event.data?.message) {
            const full = String(event.data.message.content || '');
            const usage = getChatMessageUsage(event.data.message);
            const finalThinking = extractThinkingTextFromMetadata(event.data.message.metadata);
            setMessages((prev) => {
              const idx = assistantIndexRef.current;
              if (idx < 0 || idx >= prev.length) return prev;

              const copy = prev.slice();
              const message = copy[idx];
              copy[idx] = {
                ...finalizeTimelineMessage(message, { content: full, thinking: finalThinking }),
                createdAt: event.data.message.createdAt || message.createdAt,
                ...(usage ? { usage } : {})
              };
              return copy;
            });
            setLoading(false);
          }

          if (event?.type === 'message_completed') {
            setLoading(false);
            disposerRef.current?.dispose?.();
            disposerRef.current = null;
            void loadConversations();
          }

          if (event?.type === 'error') {
            setMessages((prev) => {
              const idx = assistantIndexRef.current;
              if (idx < 0 || idx >= prev.length) return prev;

              const copy = prev.slice();
              const message = copy[idx];
              copy[idx] = appendTextPart(message, `\n[错误] ${event.data?.message || ''}`);
              return copy;
            });
            setLoading(false);
          }
        }
      );

      disposerRef.current = disposer;
    } catch (error) {
      console.error('Failed to send sidebar chat message:', error);
      setLoading(false);
      toast.error('发送消息失败');
    }
  };

  const handleUserChoiceSubmit = async (choiceId: string, answers: Record<string, string[]>): Promise<void> => {
    setMessages((prev) =>
      prev.map((message) => {
        const hasActivityMatch = message.activities?.some((activity) => activity.choiceRequest?.choiceId === choiceId) ?? false;
        const hasDisplayPartMatch = message.displayParts?.some((part) => part.type === 'tool' && part.activity.choiceRequest?.choiceId === choiceId) ?? false;

        if (!hasActivityMatch && !hasDisplayPartMatch) {
          return message;
        }

        const activities = message.activities?.map((activity) => (activity.choiceRequest?.choiceId === choiceId ? { ...activity, choiceAnswers: answers } : activity));
        const displayParts = message.displayParts?.map((part) =>
          part.type === 'tool' && part.activity.choiceRequest?.choiceId === choiceId ? { ...part, activity: { ...part.activity, choiceAnswers: answers } } : part
        );

        return {
          ...message,
          ...(activities ? { activities } : {}),
          ...(displayParts ? { displayParts } : {})
        };
      })
    );

    try {
      await window.YUA.ai.sendUserChoiceResponse({ choiceId, answers });
    } catch (error) {
      console.error('[AIChatSidebar] Failed to send user choice response:', error);
      toast.error('提交选择失败');
    }
  };

  const handleStop = async (): Promise<void> => {
    try {
      await disposerRef.current?.cancel();
    } catch {
      // noop
    }

    disposerRef.current?.dispose?.();
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col bg-background border-l">
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button className="px-3 py-1 text-sm font-medium bg-muted hover:bg-muted/80 rounded-md border border-border transition-colors" onClick={newConversation}>
          New Chat
        </button>
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
              <DropdownMenuItem onClick={() => void loadConversations()}>刷新会话</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {showHistory ? (
          <div className="p-4">
            <div className="text-sm font-medium mb-3">历史会话</div>
            {loadingConvs ? (
              <div className="text-xs text-muted-foreground">加载中...</div>
            ) : conversations.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无历史会话</div>
            ) : (
              <div className="flex flex-col gap-1">
                {conversations.map((conversation) => (
                  <button key={conversation.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors" onClick={() => void selectConversation(conversation.id)}>
                    <div className="text-sm truncate">{conversation.title || '未命名会话'}</div>
                    <div className="text-xs text-muted-foreground">
                      {conversation.messagesCount ?? 0} 条消息
                      {conversation.lastMessageAt ? ` · ${formatRelativeTime(conversation.lastMessageAt)}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full" />
        ) : (
          <div className="flex flex-col gap-3 p-4">
            {conversationUsage && (
              <div className="flex justify-center">
                <ChatTokenUsage usage={conversationUsage} label="会话累计" variant="conversation" />
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2 ${message.role === 'user' ? 'bg-primary text-primary-foreground text-sm' : 'bg-muted text-foreground'}`}>
                  {message.role === 'assistant' ? (
                    <>
                      <AssistantMessageTimeline message={message} compactCards onUserChoiceSubmit={handleUserChoiceSubmit} />
                      {message.usage && <ChatTokenUsage usage={message.usage} label="本轮" className="mt-2" />}
                      {!hasTimelineContent(message) && loading && index === messages.length - 1 ? (
                        <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                          <TbLoader2 className="h-4 w-4 animate-spin" /> 正在思考...
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleStop();
                            }}
                            className="ml-2 p-1 rounded hover:bg-background/50 transition-colors"
                            title="停止生成"
                          >
                            <TbPlayerStop className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{message.content}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={listEndRef} />
          </div>
        )}
      </div>

      <div className="px-4 py-3 shrink-0 border-t">
        <UnifiedChatInput
          ref={inputRef}
          value={inputText}
          onChange={setInputText}
          loading={loading}
          onSend={handleSend}
          onStop={handleStop}
          autoClear={false}
          showSaveButton={false}
          maxHeight={120}
          className="my-0 mx-0 max-w-none w-full"
          placeholders={['Plan, @ for context, / for commands']}
          footerLeft={
            <div className="flex items-center gap-1 min-w-0 flex-wrap">
              <ChatAgentSelect
                agents={agents}
                value={agentId}
                onValueChange={setAgentId}
                placeholder="模式"
                prefix={<span className="text-primary">@</span>}
                triggerClassName="h-auto max-w-36 gap-1 border-0 px-2 py-1 text-xs shadow-none hover:bg-muted"
              />

              <ProviderModelSelect
                providerId={providerId}
                presetId={presetId || undefined}
                modelId={modelId || undefined}
                onChange={(nextProviderId, nextModelId) => {
                  setProviderId(nextProviderId);
                  if (nextProviderId !== providerId) {
                    setPresetId('');
                  }
                  setModelId(nextModelId);
                }}
                buttonVariant="ghost"
                buttonSize="sm"
                className="h-auto px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded transition-colors"
                placeholder="选择模型"
                autoLoadFirst
                modelTypes={['chat']}
              />

              {isCoder && (
                <CodingWorkspaceButton
                  workspaceRoot={codingWorkspaceRoot}
                  workspaceLabel={codingWorkspaceLabel}
                  onPick={handlePickWorkspace}
                  onClear={clearCodingWorkspace}
                  triggerVariant="ghost"
                  triggerSize="sm"
                  triggerClassName="h-auto max-w-36 px-2 py-1 text-xs text-muted-foreground shadow-none hover:bg-muted"
                  clearVariant="ghost"
                  clearSize="icon"
                  clearClassName="h-7 w-7 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                  iconClassName="h-3.5 w-3.5"
                />
              )}
            </div>
          }
          footerRightExtra={
            <ChatFooterActions
              actionButtonClassName="h-7 w-7 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
              actions={[
                { ariaLabel: '@提及', tooltip: '@提及', icon: <TbAt className="w-4 h-4" /> },
                { ariaLabel: '联网搜索', tooltip: '联网搜索', icon: <TbWorld className="w-4 h-4" /> },
                { ariaLabel: '上传图片', tooltip: '上传图片', icon: <TbPhoto className="w-4 h-4" /> }
              ]}
              speechInput={{
                disabled: loading,
                interimText: speechInput.interimText,
                isBusy: speechInput.isBusy,
                isListening: speechInput.isListening,
                onToggle: speechInput.toggle
              }}
            />
          }
        />
      </div>
    </div>
  );
};

export default AIChatSidebar;
