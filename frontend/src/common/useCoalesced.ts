import { useCallback, useEffect, useRef } from "react";

// Returns a function to call on every ring. The first call runs the callback at once; calls
// within gapMs of the last run collapse into one more run when the window ends.
export function useCoalesced(callback: () => void, gapMs: number) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });

  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return useCallback(() => {
    const wait = lastRun.current + gapMs - Date.now();
    if (wait <= 0) {
      lastRun.current = Date.now();
      latest.current();
      return;
    }
    if (timer.current !== undefined) return; // a follow-up refresh is already scheduled
    timer.current = setTimeout(() => {
      timer.current = undefined;
      lastRun.current = Date.now();
      latest.current();
    }, wait);
  }, [gapMs]);
}
