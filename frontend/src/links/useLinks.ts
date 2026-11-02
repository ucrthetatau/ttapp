import type { DriveLink, DriveLinksResponse } from "@ttapp/shared";
import { useCallback, useEffect, useState } from "react";

export type LinksState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; links: DriveLink[] };

// Loads the links when the screen opens, and again when reload() is called (after adding or
// removing one). The old list stays on screen until the new one arrives. Same shape as
// useMembers, so the two screens behave alike.
export function useLinks(): { state: LinksState; reload: () => void } {
  const [state, setState] = useState<LinksState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let next: LinksState;
      try {
        const res = await fetch("/api/drive-links");
        if (res.ok) {
          const body = (await res.json()) as DriveLinksResponse;
          next = { status: "loaded", links: body.links };
        } else {
          next = { status: "error", message: "Couldn't load the links." };
        }
      } catch {
        next = { status: "error", message: "Can't reach the server." };
      }
      if (!cancelled) setState(next);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { state, reload };
}
