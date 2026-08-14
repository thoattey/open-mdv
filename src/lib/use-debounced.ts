'use client';

import { useEffect, useState } from 'react';

/** Trailing-edge debounce of a value, for keystroke-driven queries. */
export function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
