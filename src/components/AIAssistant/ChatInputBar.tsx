import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TbLoader2, TbSend } from 'react-icons/tb';
import { useChatSelection } from './context/ChatSelectionContext';
import TintableSvg from '@/components/common/TintableSvg';

export interface ChatInputBarProps {
  // Triggered when user hits send (Enter or button)
  onStart: (params: {
    content: string;
    providerId: string;
    instanceId: string;
    agentId: string;
  }) => void | Promise<void>;
  // Triggered when user clicks stop
  onStop?: () => void;
  // Loading indicates a streaming/processing state
  loading?: boolean;
  // Optional placeholder override
  placeholder?: string;
  // Optional className to wrap the whole input bar container
  className?: string;
}

export default function ChatInputBar({ onStart, onStop, loading, placeholder, className }: ChatInputBarProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState('');

  // consume shared provider/instance/agent state
  const { providers, agents, instancesMap, providerId, instanceId, agentId, setProviderId, setInstanceId, setAgentId, getOrderedInstances } = useChatSelection();

  // Textarea auto height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 200;
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
    // Toggle scrollbar only when overflowing the max height
    const isOverflowing = el.scrollHeight > maxH;
    setShowScrollbar(isOverflowing);
    // If user is typing at the end and content overflows, keep scroll pinned to bottom
    const isFocused = document.activeElement === el;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (isOverflowing && isFocused && atEnd) {
      el.scrollTop = el.scrollHeight;
    }
  }, [input]);

  const [showScrollbar, setShowScrollbar] = useState(false);

  const doStart = async () => {
    const content = input.trim();
    if (!content || !instanceId) return;
    try {
      await onStart?.({ content, providerId, instanceId, agentId });
      setInput('');
    } catch { /* surface errors in parent if needed */ }
  };

  const doStop = () => {
    onStop?.();
  };

  const providerInstanceContent = (() => {
    const baseClass = 'truncate text-left text-xs text-muted-foreground';
    if (!instanceId) return <span className={baseClass}>选择 服务商 · 实例</span>;
    const provider = providers.find(p => p.id === providerId) as any;
    const icon = provider?.schema?.icon as string | undefined;
    const currentInstances = instancesMap[providerId] || [];
    const instance = currentInstances.find((it: any) => it.id === instanceId);
    const instanceLabel = instance?.name || instanceId;
    if (icon) {
      return (
        <span className={`flex items-center gap-2 ${baseClass}`}>
          <TintableSvg src={icon} className="w-4 h-4" alt={provider?.label || providerId} />
          <span className="truncate">{instanceLabel}</span>
        </span>
      );
    }
    const providerLabel = provider?.label || providerId || '服务商';
    return <span className={baseClass}>{providerLabel} · {instanceLabel}</span>;
  })();

  // Flatten and filter instances across providers for global search
  const trimmed = query.trim().toLowerCase();
  const filteredResults = trimmed
    ? providers.flatMap((p: any) =>
        (getOrderedInstances ? getOrderedInstances(p.id) : (instancesMap[p.id] || []))
          .filter((it: any) => {
            const name = (it.name || '').toString().toLowerCase();
            const id = (it.id || '').toString().toLowerCase();
            return name.includes(trimmed) || id.includes(trimmed);
          })
          .map((it: any) => ({ p, it }))
      )
    : [];

  return (
    <div className={`relative box-border my-2 mx-2 max-w-[800px] w-[calc(100%-1rem)] ${className || ''}`}>
      <Textarea
        ref={textareaRef}
        rows={1}
        className={clsx(
          'resize-none min-h-0 max-h-52 pr-24 pb-16 box-border rounded-2xl text-muted-foreground bg-muted',
          showScrollbar ? 'overflow-y-auto' : 'overflow-y-hidden'
        )}
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={placeholder ?? '输入消息'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!loading && instanceId) doStart();
          }
        }}
      />

      {/* Send / Stop */}
      {!loading ? (
        <Button
          onClick={doStart}
          size="icon"
          disabled={!input.trim() || !instanceId}
          className="absolute bottom-2 right-2 rounded-full"
          aria-label="发送"
        >
          <TbSend className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          onClick={doStop}
          size="icon"
          variant={"destructive"}
          className="absolute bottom-2 right-2 rounded-full"
          aria-label="停止"
        >
          <TbLoader2 className="h-4 w-4 animate-spin" />
        </Button>
      )}

      {/* Bottom toolbar: provider/instance selector + agent selector */}
      <div className="absolute bottom-2 left-2 right-16 flex items-center gap-1 overflow-x-auto">
        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className='rounded-full'
              >
                {providerInstanceContent}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[260px]">
              {/* Search box */}
              <div className="p-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索实例..."
                  className="h-8 text-xs"
                />
              </div>
              {/* Results when searching */}
              {trimmed ? (
                <div className="max-h-60 overflow-auto">
                  {filteredResults.length === 0 ? (
                    <div className="px-2 pb-2 text-xs text-muted-foreground">未找到匹配实例</div>
                  ) : (
                    filteredResults.map(({ p, it }: any) => (
                      <DropdownMenuItem
                        key={`${p.id}:${it.id}`}
                        onSelect={() => {
                          setProviderId(p.id);
                          setInstanceId(it.id);
                        }}
                      >
                        <span className="truncate">{it.name || it.id}</span>
                        <span className="ml-2 text-muted-foreground text-xs">@{p.label}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              ) : (
                // Default: grouped by provider
                providers.map((p) => {
                  const list = getOrderedInstances(p.id);
                  return (
                    <DropdownMenuSub key={p.id}>
                      <DropdownMenuSubTrigger>
                        <span className="flex items-center gap-2">
                          {p?.schema?.icon && (
                            <TintableSvg src={p.schema.icon} className="w-4 h-4" alt={p.label} />
                          )}
                          <span>{p.label}</span>
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {list.length === 0 ? (
                          <DropdownMenuItem
                            onSelect={async () => {
                              try { await (window as any).YUA.window.openWindow('settings' as any, { category: 'ai', aiProviderId: p.id }); } catch { }
                            }}
                          >
                            未配置实例，去配置…
                          </DropdownMenuItem>
                        ) : (
                          list.map((it: any) => (
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
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="shrink-0">
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="h-8 rounded-full text-xs text-muted-foreground">
              <SelectValue placeholder="选择 Agent" />
            </SelectTrigger>
            <SelectContent className="text-xs">
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="shrink-0 text-xs text-muted-foreground">
          Enter 发送、Shift+Enter 换行
        </div>
      </div>
    </div>
  );
}
