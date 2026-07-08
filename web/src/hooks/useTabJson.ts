import { useState, useEffect } from 'react';
import type { TabJson } from '../types/TabJson';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: TabJson };

/**
 * Fetches and parses /tab.json.
 * Served from the monorepo root via Vite's publicDir config.
 */
export function useTabJson(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch('/tab.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
        return res.json() as Promise<TabJson>;
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ok', data });
      })
      .catch((err: Error) => {
        if (!cancelled)
          setState({ status: 'error', message: err.message });
      });

    return () => { cancelled = true; };
  }, []);

  return state;
}
