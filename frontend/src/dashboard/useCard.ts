import { useCallback, useEffect, useRef, useState } from "react";
import { readError } from "../common/readError.ts";

export type CardState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: T };

// Members who come back to the app after a while should see fresh numbers, but one who flips
// between apps every few seconds should not cause a request each time.
const REFRESH_AFTER_MS = 30_000;

// Loads one dashboard card on its own: its own loading state and its own error, so a card
// that fails never blanks the others. The old data stays on screen while a refresh runs.
// It refreshes when the member returns to the app (a tab or an installed app coming back to
// the front), because the sheets and calendars have no doorbell of their own.
export function useCard<T>(url: string): {
  state: CardState<T>;
  reload: () => void;
} {
  const [state, setState] = useState<CardState<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const loadedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let next: CardState<T>;
      try {
        const res = await fetch(url);
        next = res.ok
          ? { status: "loaded", data: (await res.json()) as T }
          : { status: "error", message: await readError(res) };
      } catch {
        next = { status: "error", message: "Can't reach the server." };
      }
      if (cancelled) return;
      loadedAt.current = Date.now();
      setState(next);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [url, version]);

  useEffect(() => {
    function onVisible() {
      if (
        document.visibilityState === "visible" &&
        Date.now() - loadedAt.current > REFRESH_AFTER_MS
      ) {
        reload();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { state, reload };
}
