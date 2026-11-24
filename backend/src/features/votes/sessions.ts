import type { PastVote, VoteSession } from "@ttapp/shared";

// A "session" is one meeting's worth of votes. The app has no meeting record, so it is worked
// out from the votes themselves: if a vote opens more than this long after the previous one
// closed, it starts a new session. Four hours keeps a long deliberation (or a meeting that runs
// past midnight) together, while the next morning's vote starts a fresh one.
export const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

export type SessionInput = { openedAt: Date; vote: PastVote };

// Groups closed votes into sessions. Because it is computed every time the list is read,
// deleting a vote just changes the grouping: nothing is stored that could go out of date.
// Returns the sessions newest first, and the votes inside each one in the order they happened.
export function groupIntoSessions(
  inputs: SessionInput[],
  maxSessions: number,
): VoteSession[] {
  const ordered = [...inputs].sort(
    (a, b) => a.openedAt.getTime() - b.openedAt.getTime(),
  );
  const groups: SessionInput[][] = [];
  let lastClosed = -Infinity;
  for (const item of ordered) {
    const closed = new Date(item.vote.closedAt).getTime();
    if (item.openedAt.getTime() - lastClosed > SESSION_GAP_MS) groups.push([]);
    groups[groups.length - 1].push(item);
    lastClosed = Math.max(lastClosed, closed);
  }
  return groups
    .reverse()
    .slice(0, maxSessions)
    .map((group) => ({
      startedAt: group[0].openedAt.toISOString(),
      endedAt: new Date(
        Math.max(...group.map((g) => new Date(g.vote.closedAt).getTime())),
      ).toISOString(),
      votes: group.map((g) => g.vote),
    }));
}
