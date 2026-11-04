import { DOORBELL } from "@ttapp/shared";
import { useCallback, useEffect, useRef } from "react";
import { useDoorbell } from "../common/useDoorbell.ts";

// If many people answer within moments of each other, the backend rings for every answer. A page
// must not refetch for each one, so rings are coalesced: the first ring refreshes right away (a
// vote opening or closing must show at once), and any more within this window collapse into one
// more refresh when the window ends. Forty answers in ten seconds cost each page about seven
// refreshes instead of forty.
const MIN_GAP_MS = 1500;

// The Votes page's doorbell: calls onVotesChange when a vote opens, closes or is deleted (a
// redo), when someone answers, or when the headcount changes what an open vote needs. The ring
// carries no data, so the page asks the backend again through its normal routes. Unlike the
// feed there is no "new posts" banner: this page is one short card, nothing shifts under your
// thumb, and a vote opening or closing is something you need to see right away.
export function useVotesDoorbell(onVotesChange: () => void) {
  const latest = useRef(onVotesChange);
  useEffect(() => {
    latest.current = onVotesChange;
  });

  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onRing = useCallback(() => {
    const wait = lastRun.current + MIN_GAP_MS - Date.now();
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
  }, []);

  useDoorbell(DOORBELL.votes.topic, DOORBELL.votes.events, onRing);
}
