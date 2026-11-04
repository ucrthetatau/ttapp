import type {
  CurrentVote,
  CurrentVoteResponse,
  PastVote,
  PastVotesResponse,
} from "@ttapp/shared";
import { useCallback, useEffect, useState } from "react";

export type VotesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; current: CurrentVote | null; past: PastVote[] };

// Loads the open vote and the recent results together when the screen opens, and again when
// reload() is called (after answering). The old screen stays until the new data arrives.
// Same shape as useLinks and useMembers, so the screens behave alike.
export function useVotes(): { state: VotesState; reload: () => void } {
  const [state, setState] = useState<VotesState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let next: VotesState;
      try {
        const [currentRes, pastRes] = await Promise.all([
          fetch("/api/votes/current"),
          fetch("/api/votes"),
        ]);
        if (currentRes.ok && pastRes.ok) {
          const current = (await currentRes.json()) as CurrentVoteResponse;
          const past = (await pastRes.json()) as PastVotesResponse;
          next = { status: "loaded", current, past: past.votes };
        } else {
          next = { status: "error", message: "Couldn't load the votes." };
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
