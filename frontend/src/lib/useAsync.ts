"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (d: T | null | ((prev: T | null) => T | null)) => void;
}

/** Runs `fn` on mount and whenever `deps` change. Ignores answers that arrive late. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const ticket = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    const mine = ++ticket.current;
    setLoading(true);
    setError(null);
    fnRef.current().then(
      (d) => { if (mine === ticket.current) { setData(d); setLoading(false); } },
      (e) => {
        if (mine !== ticket.current) return;
        setError(e instanceof ApiError ? e : new ApiError(0, e?.message ?? "Something went wrong"));
        setLoading(false);
      },
    );
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); return () => { ticket.current++; }; }, deps);
  return { data, error, loading, reload: run, setData };
}
