import { useEffect, useRef, useState } from "react";

// True for a moment after `value` changes, so a number that moves by itself (a live update from
// another member) can glow briefly and the eye notices it. Not true on the first render, and it
// never fires for changes you made yourself unless the value on screen changes too.
export function useFlash(value: unknown, ms = 1000): boolean {
  const previous = useRef(value);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    setOn(true);
    const timer = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return on;
}
