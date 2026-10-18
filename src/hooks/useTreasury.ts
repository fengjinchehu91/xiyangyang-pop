import { useCallback, useEffect, useRef, useState } from 'react';
import { chainConfig } from '../config/chain';
import { hasConfiguredSources, initialDashboard, readDashboard } from '../data/treasury';

export function useTreasury() {
  const configured = hasConfiguredSources();
  const [data, setData] = useState(() => initialDashboard(true));
  const [refreshing, setRefreshing] = useState(configured);
  const active = useRef(false);
  const mounted = useRef(false);
  const lastAttempt = useRef(0);
  const refresh = useCallback(async () => {
    if (!configured || active.current) return;
    active.current = true;
    lastAttempt.current = Date.now();
    setRefreshing(true);
    try {
      const next = await readDashboard();
      if (mounted.current) setData(next);
    } finally {
      active.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [configured]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, chainConfig.refreshIntervalMs);
    const resume = () => {
      if (!document.hidden && Date.now() - lastAttempt.current >= chainConfig.refreshIntervalMs) {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refresh]);
  return { data, refresh, refreshing, configured };
}
