import { DOORBELL } from "@ttapp/shared";
import { useCallback } from "react";
import { useCoalesced } from "../common/useCoalesced.ts";
import { useDoorbell } from "../common/useDoorbell.ts";

// If many people answer within moments of each other, the backend rings for every answer. A page
// must not refetch for each one, so rings are coalesced: the first ring refreshes right away,
// and any more within the window collapse into one more refresh when the window ends.
//
// Two windows, because the two kinds of ring matter differently:
//   - A vote opening, closing or being deleted, or the headcount changing, must show at once, so
//     those use a short window and reload the whole screen.
//   - An answer only moves the "N of M answered" number. Fifty people answering within half a
//     minute would make every phone refetch constantly and slow the server down while people
//     are voting, so answers use a longer window and refetch only the open vote. Nothing is
//     missed: the last ring in a burst always gets its refresh.
const CHANGE_GAP_MS = 1500;
const ANSWER_GAP_MS = 5000;

// The Votes page's doorbell. onVotesChange runs when a vote opens, closes or is deleted (a
// redo), or the headcount changes what an open vote needs (and after a reconnect, when a ring
// may have been missed). onAnswersChange runs when someone answers. The ring carries no data,
// so the page asks the backend again through its normal routes. Unlike the feed there is no
// "new posts" banner: this page is one short card, nothing shifts under your thumb, and a vote
// opening or closing is something you need to see right away.
export function useVotesDoorbell(
  onVotesChange: () => void,
  onAnswersChange: () => void,
) {
  const changed = useCoalesced(onVotesChange, CHANGE_GAP_MS);
  const answered = useCoalesced(onAnswersChange, ANSWER_GAP_MS);

  const onRing = useCallback(
    (event?: string) => (event === "vote-answered" ? answered() : changed()),
    [changed, answered],
  );

  useDoorbell(DOORBELL.votes.topic, DOORBELL.votes.events, onRing);
}
