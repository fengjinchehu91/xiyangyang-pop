import { useCallback, useEffect, useRef, useState } from 'react';
import { hasVerifiedFlowSources, readBuybackFlows, type BuybackFlows } from '../data/buybackFlows';
import type { ReadResult } from '../data/types';

const refreshInterval = 60_000;

export function useBuybackFlows() {
  const [data, setData] = useState<ReadResult<BuybackFlows>>({ status: hasVerifiedFlowSources() ? 'loading' : 'unconfigured' });
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(false);
  const mounted = useRef(false);
  const lastAttempt = useRef(0);
  const refresh = useCallback(async () => {
    if (!hasVerifiedFlowSources()) { setData({ status: 'unconfigured' }); return; }
    if (active.current) return;
    active.current = true;
    lastAttempt.current = Date.now();
    setRefreshing(true);
    setData((previous) => previous.status === 'ready' ? previous : { status: 'loading' });
    try {
      const next = await readBuybackFlows();
      if (mounted.current) setData({ status: 'ready', data: next, updatedAt: next.updatedAt });
    } catch (error) {
      if (mounted.current) setData({ status: 'error',
        message: error instanceof Error ? error.message : 'Buyback history unavailable' });
    } finally {
      active.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!hasVerifiedFlowSources()) return () => { mounted.current = false; };
    if (!document.hidden) void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, refreshInterval);
    const resume = () => {
      if (!document.hidden && Date.now() - lastAttempt.current >= refreshInterval) void refresh();
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refresh]);

  return { data, refresh, refreshing };
}
