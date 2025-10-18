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
import { TbSend, TbLoader2 } from 'react-icons/tb';
import { useEffect, useRef, useState } from 'react';

export default function ChatDemo() {
  const [input, setInput] = useState('你好，介绍一下你自己');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [providerId, setProviderId] = useState('openai');
  // providerId -> instances[]
  const [instancesMap, setInstancesMap] = useState<Record<string, any[]>>({});
  const [instanceId, setInstanceId] = useState<string>('');
  const [agentId, setAgentId] = useState('basic');
  const disposerRef = useRef<{ dispose: () => void; cancel: () => Promise<any> } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  const start = async () => {
    if (!instanceId) {
      setOutput('请先选择 服务商 · 实例');
      return;
    }
    setOutput('');
    setLoading(true);
    const disposer = await window.YUA.ai.chatStream(
      { messages: [{ role: 'user', content: input }], providerId, providerInstanceId: instanceId, agentId, stream: true },
      (ev: any) => {
        if (ev?.type === 'delta' && ev.data?.text) setOutput((s) => s + ev.data.text);
        if (ev?.type === 'error') setOutput((s) => s + `\n[错误] ${ev.data?.message || ''}`);
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

  return (
    <div className="w-full h-full bg-background text-foreground overflow-hidden flex flex-col">
      {/* 顶部可拖拽导航栏 */}
      <DragAbleTitle title={<span>🗨️ 聊天</span>} />

      {/* 中部内容区（可滚动） */}
      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
        {/* 输出区 */}
        <pre className="whitespace-pre-wrap rounded border p-2 bg-muted/20 min-h-[160px]">{output}</pre>
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
                              try { await window.YUA.window.openWindow('settings' as any, { category: 'ai', aiProviderId: p.id }); } catch {}
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
