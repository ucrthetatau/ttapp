import type {
  CurrentVote,
  CurrentVoteResponse,
  HeadcountResponse,
  PastVote,
  PastVotesResponse,
} from "@ttapp/shared";
import { useCallback, useEffect, useState } from "react";

export type VotesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      current: CurrentVote | null;
      past: PastVote[];
      headcount: HeadcountResponse;
    };

// Loads the open vote, the recent results and the headcount together when the screen opens,
// and again when reload() is called (after answering, or after the Regent does something).
// The old screen stays until the new data arrives. Same shape as useLinks and useMembers, so
// the screens behave alike.
export function useVotes(): { state: VotesState; reload: () => void } {
  const [state, setState] = useState<VotesState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let next: VotesState;
      try {
        const [currentRes, pastRes, headcountRes] = await Promise.all([
          fetch("/api/votes/current"),
          fetch("/api/votes"),
          fetch("/api/votes/headcount"),
        ]);
        if (currentRes.ok && pastRes.ok && headcountRes.ok) {
          next = {
            status: "loaded",
            current: (await currentRes.json()) as CurrentVoteResponse,
            past: ((await pastRes.json()) as PastVotesResponse).votes,
            headcount: (await headcountRes.json()) as HeadcountResponse,
          };
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
