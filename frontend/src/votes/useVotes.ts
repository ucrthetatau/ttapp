import type {
  CurrentVote,
  CurrentVoteResponse,
  HeadcountResponse,
  PastVote,
  PastVotesResponse,
} from "@ttapp/shared";
import { useCallback, useEffect, useRef, useState } from "react";

// How often a Votes page that is on screen checks whether the open vote changed, in case the
// live doorbell does not reach it (some Wi-Fi networks block the kind of connection it uses).
// One small request per phone: fifty phones are about five requests a second.
const POLL_MS = 10_000;
// Every this many checks, reload the whole screen instead of just the open vote, so a missed
// ring about a closed vote or the headcount is caught too (about once a minute).
const FULL_RELOAD_EVERY = 6;

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
export function useVotes(): {
  state: VotesState;
  reload: () => void;
  refreshCurrent: () => Promise<void>;
} {
  const [state, setState] = useState<VotesState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  // What the open vote looked like the last time the screen loaded, as text, so the check
  // below can tell whether anything about it moved.
  const lastCurrent = useRef("null");

  // Looks at just the open vote (one small request) and brings the screen up to date.
  //   - Same vote, different numbers (someone answered, or you did): only the open vote card
  //     is updated in place, nothing else is fetched.
  //   - A different vote, or none now (one opened, closed or was deleted): everything may have
  //     changed (the results list, the headcount), so the whole screen reloads.
  // Answers are by far the most frequent change, and every phone gets told about each one, so
  // keeping that case to a single request is what keeps the server fast while people vote.
  const refreshCurrent = useCallback(async () => {
    try {
      const res = await fetch("/api/votes/current");
      if (!res.ok) return;
      const current = (await res.json()) as CurrentVoteResponse;
      const text = JSON.stringify(current);
      if (text === lastCurrent.current) return;
      const before = JSON.parse(lastCurrent.current) as CurrentVoteResponse;
      lastCurrent.current = text;
      if ((before?.id ?? null) !== (current?.id ?? null)) {
        reload();
        return;
      }
      setState((prev) =>
        prev.status === "loaded" ? { ...prev, current } : prev,
      );
    } catch {
      // A blip is fine: the next check tries again.
    }
  }, [reload]);

  // A safety net behind the doorbell: while the page is on screen, check the open vote every
  // few seconds, and reload everything about once a minute. If the doorbell works this finds
  // nothing new. The full reload is three requests, so it is kept rare.
  useEffect(() => {
    let ticks = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      ticks += 1;
      if (ticks % FULL_RELOAD_EVERY === 0) reload();
      else void refreshCurrent();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCurrent, reload]);

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
          const current = (await currentRes.json()) as CurrentVoteResponse;
          lastCurrent.current = JSON.stringify(current);
          next = {
            status: "loaded",
            current,
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

  return { state, reload, refreshCurrent };
}
