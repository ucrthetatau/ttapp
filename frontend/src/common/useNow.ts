import { useEffect, useState } from "react";

// The current time, refreshed every minute, so "Today", "Tomorrow", "Happening now" and the
// greeting stay right if the app is left open (even past midnight).
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
