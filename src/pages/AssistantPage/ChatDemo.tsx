import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEffect, useRef, useState } from 'react';

export default function ChatDemo() {
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

  useEffect(() => {
    (async () => {
      try { setProviders(await (window as any).YUA.ai.getProviders()); } catch {}
      try { setAgents(await (window as any).YUA.ai.getAgents()); } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!providerId) return;
      try {
        const list = await (window as any).YUA.ai.listInstances(providerId);
        setInstances(list || []);
        setInstanceId(list?.[0]?.id || '');
      } catch {}
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
    try { await disposerRef.current?.cancel(); } catch {}
    disposerRef.current?.dispose?.();
    setLoading(false);
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)} />
        {!loading ? (
          <Button onClick={start} className="rounded">开始</Button>
        ) : (
          <Button onClick={stop} variant={"destructive"} className="rounded">停止</Button>
        )}
      </div>
      <div className="flex gap-2">
        <select className="rounded border px-2 py-1" value={providerId} onChange={e => setProviderId(e.target.value)}>
          {providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
        </select>
        <select className="rounded border px-2 py-1" value={instanceId} onChange={e => setInstanceId(e.target.value)}>
          <option value="">直接使用服务商</option>
          {instances.map((it) => (<option key={it.id} value={it.id}>{it.name || it.id}</option>))}
        </select>
        <select className="rounded border px-2 py-1" value={agentId} onChange={e => setAgentId(e.target.value)}>
          {agents.map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}
        </select>
      </div>
      <pre className="whitespace-pre-wrap rounded border p-2 bg-muted/20 min-h-[120px]">{output}</pre>
      <div className="text-xs text-gray-500">Provider: {providerId} · Agent: {agentId} · 支持停止/取消</div>
    </div>
  );
}
