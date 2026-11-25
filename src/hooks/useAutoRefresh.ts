import { useEffect, useRef } from 'react';

/**
 * Refresh live data without making tab focus feel like a page reload.
 * Poll only while visible and throttle focus/visibility events so switching
 * between tabs does not issue duplicate requests.
 */
export function useAutoRefresh(refresh: () => void | Promise<void>, intervalMs = 60_000) {
  const refreshRef = useRef(refresh);
  const lastRefreshAt = useRef(0);
  const running = useRef(false);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    lastRefreshAt.current = Date.now();
    const runIfStale = async () => {
      if (disposed || document.visibilityState !== 'visible' || running.current) return;
      if (Date.now() - lastRefreshAt.current < intervalMs) return;
      running.current = true;
      lastRefreshAt.current = Date.now();
      try {
        await refreshRef.current();
      } finally {
        running.current = false;
      }
    };

    // The first page load is handled by each screen. This interval only
    // maintains freshness while the user is actively viewing the page.
    const timer = window.setInterval(() => void runIfStale(), intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void runIfStale();
    };
    const onFocus = () => void runIfStale();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [intervalMs]);
}
