import { useEffect, useMemo, useRef, useState } from 'react';
import { onSnapshot, type DocumentReference, type Query, type DocumentData } from 'firebase/firestore';

export interface LiveState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** Live document. Pass null to skip. `key` must change when the reference changes. */
export function useDoc<T = DocumentData>(ref: DocumentReference | null, key: string): LiveState<(T & { id: string }) | null> {
  const [state, setState] = useState<LiveState<(T & { id: string }) | null>>({ data: null, loading: !!ref, error: null });
  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? ({ ...(snap.data() as T), id: snap.id }) : null, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Live query. Pass null to skip. `key` must change when the query changes. */
export function useQuery<T = DocumentData>(q: Query | null, key: string): LiveState<(T & { id: string })[]> {
  const [state, setState] = useState<LiveState<(T & { id: string })[]>>({ data: [], loading: !!q, error: null });
  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ ...(d.data() as T), id: d.id })), loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Runs an async loader and exposes loading/error/reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): LiveState<T | null> & { reload: () => void } {
  const [state, setState] = useState<LiveState<T | null>>({ data: null, loading: true, error: null });
  const [n, setN] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current().then(
      (data) => alive && setState({ data, loading: false, error: null }),
      (error) => alive && setState({ data: null, loading: false, error }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return useMemo(() => ({ ...state, reload: () => setN((x) => x + 1) }), [state]);
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(q: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return match;
}
