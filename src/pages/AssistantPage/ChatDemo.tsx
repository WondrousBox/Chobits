import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DragAbleTitle from '@/components/common/DragAbleTitle';
import { TbSend, TbLoader2 } from 'react-icons/tb';
import { useEffect, useRef, useState } from 'react';

export default function ChatDemo() {
  const NONE_VALUE = '__none__'
  const [input, setInput] = useState('你好，介绍一下你自己');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [providerId, setProviderId] = useState('openai');
  const [instances, setInstances] = useState<any[]>([]);
  const [instanceId, setInstanceId] = useState<string>('');
  const [agentId, setAgentId] = useState('basic');
  const disposerRef = useRef<{ dispose: () => void; cancel: () => Promise<any> } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    (async () => {
      try { setProviders(await (window as any).YUA.ai.getProviders()); } catch { }
      try { setAgents(await (window as any).YUA.ai.getAgents()); } catch { }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!providerId) return;
      try {
        const list = await (window as any).YUA.ai.listInstances(providerId);
        setInstances(list || []);
        setInstanceId(list?.[0]?.id || '');
      } catch { }
    })();
  }, [providerId]);

  const start = async () => {
    setOutput('');
    setLoading(true);
    const disposer = await (window as any).YUA.ai.chatStream(
      { messages: [{ role: 'user', content: input }], providerId, providerInstanceId: instanceId || undefined, agentId, stream: true },
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
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!loading) start();
            }
          }}
        />

        {/* 右下角发送/停止按钮 */}
        {!loading ? (
          <Button
            onClick={start}
            disabled={!input.trim()}
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
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger className="h-7 px-2 text-[11px] w-auto min-w-[120px] border-0 bg-muted/30 hover:bg-muted/50 rounded-md">
                <SelectValue placeholder="选择服务商" />
              </SelectTrigger>
              <SelectContent className="text-xs">
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="shrink-0">
            <Select
              value={instanceId && instanceId.length ? instanceId : NONE_VALUE}
              onValueChange={(v) => setInstanceId(v === NONE_VALUE ? '' : v)}
            >
              <SelectTrigger className="h-7 px-2 text-[11px] w-auto min-w-[150px] border-0 bg-muted/30 hover:bg-muted/50 rounded-md">
                <SelectValue placeholder="直接使用服务商" />
              </SelectTrigger>
              <SelectContent className="text-xs">
                <SelectItem value={NONE_VALUE}>直接使用服务商</SelectItem>
                {instances.map((it) => (
                  <SelectItem key={it.id} value={it.id}>{it.name || it.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
