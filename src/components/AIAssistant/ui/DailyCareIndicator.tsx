import React, { useCallback, useEffect, useState } from 'react';
import { TbHeartbeat, TbHeartOff } from 'react-icons/tb';

export const DailyCareIndicator: React.FC = () => {
  const hasBridge = Boolean(window.YUA.dailyCare);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    if (!hasBridge) return;
    try {
      const snapshot = await window.YUA.dailyCare['dailyCare:getSnapshot']();
      setEnabled(snapshot.enabled);
    } catch (error) {
      console.warn('[daily-care] indicator refresh failed', error);
    }
  }, [hasBridge]);

  useEffect(() => {
    if (!hasBridge) return;
    refresh();
    const timer = setInterval(refresh, 120 * 1000);
    return () => {
      clearInterval(timer);
    };
  }, [hasBridge, refresh]);

  if (!hasBridge) return null;

  const toggle = async (): Promise<void> => {
    if (enabled == null || pending) return;
    setPending(true);
    try {
      const next = await window.YUA.dailyCare['dailyCare:updateSettings']({ enabled: !enabled });
      setEnabled(next.enabled);
    } catch (error) {
      console.warn('[daily-care] toggle failed', error);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`pointer-events-auto absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold shadow-lg transition ${enabled ? 'bg-emerald-500 text-white' : 'bg-slate-600/80 text-white/90'
        } ${pending ? 'opacity-70' : ''}`}
      disabled={pending}
    >
      {enabled ? <TbHeartbeat className="h-3.5 w-3.5" /> : <TbHeartOff className="h-3.5 w-3.5" />}
      {enabled ? '关心 ON' : '关心 OFF'}
    </button>
  );
};

export default DailyCareIndicator;
