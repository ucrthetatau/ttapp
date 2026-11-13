import type { DashboardSourcesResponse } from "@ttapp/shared";
import { useCallback, useEffect, useState } from "react";
import { loadSources } from "./api.ts";

export type SourcesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: DashboardSourcesResponse };

// Loads what the dashboard reads from, and again when reload() is called (after a save or
// remove). The old data stays on screen until the new data arrives, like useLinks.
export function useSources(): { state: SourcesState; reload: () => void } {
  const [state, setState] = useState<SourcesState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    void loadSources().then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "loaded", data: result.data }
          : { status: "error", message: result.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { state, reload };
}
