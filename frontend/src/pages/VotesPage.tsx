import { VOTE_KIND_INFO } from "@ttapp/shared";
import type { PastVote, VoteSession } from "@ttapp/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/auth.ts";
import { canRunVotes, canSeeVoteDetails } from "../votes/access.ts";
import { deleteVote } from "../votes/api.ts";
import CloseControls from "../votes/CloseControls.tsx";
import CurrentVoteCard from "../votes/CurrentVoteCard.tsx";
import DetailsDialog from "../dashboard/DetailsDialog.tsx";
import DetailsPanel from "../votes/DetailsPanel.tsx";
import ExplainInfo from "../votes/ExplainInfo.tsx";
import HeadcountControl from "../votes/HeadcountControl.tsx";
import OpenVoteDialog from "../votes/OpenVoteDialog.tsx";
import VoteModal from "../votes/VoteModal.tsx";
import { useVotes } from "../votes/useVotes.ts";
import { useVotesDoorbell } from "../votes/useVotesDoorbell.ts";
import { VoteCardSkeleton } from "../components/Skeleton.tsx";
import { ChevronRightIcon } from "../components/icons.tsx";

// One meeting's worth of finished votes as a drop-down: the date and a summary on the header,
// the votes inside once it is open. Whether it is open is kept by the page (see below).
function SessionCard({
  session,
  open,
  onToggle,
  children,
}: {
  session: VoteSession;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const when = new Date(session.startedAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  // A quiet row, not a card: a thin line under it, a small arrow that turns when open. The
  // votes inside are the cards, and they already say how each one ended.
  return (
    <li className="border-b border-line/60 pb-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-2 text-left"
      >
        <ChevronRightIcon
          className={`h-4 w-4 shrink-0 text-gold-400 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
        <span className="text-sm font-semibold text-ink">{when}</span>
        <span className="text-sm text-ink/60">
          · {session.votes.length}{" "}
          {session.votes.length === 1 ? "vote" : "votes"}
        </span>
      </button>
      {open && <ul className="space-y-2 pt-1">{children}</ul>}
    </li>
  );
}

// One finished vote: what it was, how it ended, and turnout. Never the yes/no split or who
// voted what (that is the Regent's private view, opened with the Details button). The info
// button explains the rule without the yes count. The buttons only show for people the backend
// would let use them; the backend refuses everyone else regardless.
function PastVoteRow({
  vote,
  onDetails,
  onDelete,
}: {
  vote: PastVote;
  onDetails?: () => void;
  onDelete?: () => void;
}) {
  const passed = vote.result === "pass";
  return (
    <li className="rounded-2xl border border-line bg-surface shadow-soft">
      <div
        className={`flex items-center gap-2 rounded-t-2xl px-4 py-2.5 text-lg font-extrabold tracking-wide text-white uppercase ${
          passed ? "bg-green-700" : "bg-red-700"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {passed ? (
            <path d="M5 12.5 10 17.5 19 7" />
          ) : (
            <path d="M6 6l12 12M18 6 6 18" />
          )}
        </svg>
        {passed ? "Passed" : "Did not pass"}
      </div>
      <div className="relative p-4">
        <p className="min-w-0 pr-10 font-bold text-ink">{vote.title}</p>
        <p className="mt-1 text-xs text-ink/60">
          {VOTE_KIND_INFO[vote.kind].label} ·{" "}
          {new Date(vote.closedAt).toLocaleDateString()} · {vote.answered} of{" "}
          {vote.presentCount - vote.abstainCount}{" "}
          {vote.abstainCount > 0 ? "counted" : "present"} answered
          {vote.abstainCount > 0 && ` · ${vote.abstainCount} abstained`}
          {vote.tiebreak && " · tie decided by the Regent"}
        </p>
        <ExplainInfo
          kind={vote.kind}
          present={vote.presentCount}
          abstained={vote.abstainCount}
          corner="top-3 right-3"
        />
        {(onDetails || onDelete) && (
          <div className="mt-2 flex gap-2">
            {onDetails && (
              <button type="button" onClick={onDetails} className="btn-small">
                Details
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-500/10"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// /votes: the open vote (with Yes and No for members who may vote) and the recent results.
// The Regent (president) also gets the controls to run a meeting's votes: who is present, open,
// close, and the private details. Admins get the run controls but not the details, matching the
// backend's rules.
export default function VotesPage() {
  const auth = useAuth();
  const roles = auth.status === "signedIn" ? auth.me.roles : [];
  const isRegent = roles.includes("president");
  const runVotes = canRunVotes(roles);
  const seeDetails = canSeeVoteDetails(roles);

  const { state, reload, refreshCurrent } = useVotes();

  // When the Regent opens, closes or deletes a vote (or changes who is present), the backend
  // rings and this loads the new data by itself. The old screen stays until it arrives.
  useVotesDoorbell(reload, refreshCurrent);
  // How many sessions are listed. Each "Show more" press reveals the next older one.
  const [sessionsShown, setSessionsShown] = useState(1);
  // Which session drop-downs the person has opened or closed by hand, by key. Untouched ones
  // follow the default: only the newest is open.
  const [sessionOpen, setSessionOpen] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [closedResult, setClosedResult] = useState<"pass" | "fail" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  // The open vote the member pressed "Decide later" on. A different vote pops up again.
  const [dismissedVote, setDismissedVote] = useState<string | null>(null);

  // After closing: the Regent goes straight to the private details; an admin, who may not see
  // those, just gets the result.
  function handleClosed(id: string, result: "pass" | "fail") {
    setError(null);
    if (seeDetails) {
      setDetailsFor(id);
      setClosedResult(null);
    } else {
      setClosedResult(result);
    }
    reload();
  }

  async function handleDeletePast(vote: PastVote) {
    const ok = window.confirm(
      `Delete "${vote.title}"? The vote and all its answers are removed, and a new vote can be opened. This can't be undone.`,
    );
    if (!ok) return;
    setError(null);
    const result = await deleteVote(vote.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (detailsFor === vote.id) setDetailsFor(null);
    reload();
  }

  const needsAnswer =
    state.status === "loaded" &&
    state.current !== null &&
    state.current.canAnswer &&
    state.current.myAnswer === "none" &&
    dismissedVote !== state.current.id;

  return (
    <main className="mx-auto max-w-2xl space-y-4 pt-3">
      <h1 className="flex min-h-11 items-center pl-14 text-[32px] leading-tight font-extrabold text-ink">
        Votes
      </h1>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      {state.status === "loading" && <VoteCardSkeleton />}
      {state.status === "error" && <p role="alert">{state.message}</p>}
      {state.status === "loaded" && (
        <>
          {closedResult && (
            <p role="status" className="card py-4 font-medium text-ink">
              Vote closed: {closedResult === "pass" ? "passed" : "did not pass"}
              .
            </p>
          )}
          {/* The Regent's private view of a closed vote is a pop-up, so the result stands out. */}
          <DetailsDialog
            open={seeDetails && detailsFor !== null}
            title="Vote details"
            onClose={() => setDetailsFor(null)}
          >
            {detailsFor && (
              <DetailsPanel key={detailsFor} voteId={detailsFor} />
            )}
          </DetailsDialog>

          {state.current ? (
            <>
              {/* A vote you still have to answer pops up over the page. While it is up the
                  page behind shows no copy of it; answering or "Decide later" brings the
                  card back, with Yes and No still there. */}
              <VoteModal
                open={needsAnswer}
                onDismiss={() => setDismissedVote(state.current?.id ?? null)}
              >
                <CurrentVoteCard
                  vote={state.current}
                  isRegent={isRegent}
                  onChanged={reload}
                  controls={
                    runVotes ? (
                      <CloseControls
                        vote={state.current}
                        onClosed={handleClosed}
                        onDeleted={reload}
                        onChanged={reload}
                      />
                    ) : undefined
                  }
                />
              </VoteModal>
              {!needsAnswer && (
                <CurrentVoteCard
                  vote={state.current}
                  isRegent={isRegent}
                  onChanged={reload}
                  controls={
                    runVotes ? (
                      <CloseControls
                        vote={state.current}
                        onClosed={handleClosed}
                        onDeleted={reload}
                        onChanged={reload}
                      />
                    ) : undefined
                  }
                />
              )}
            </>
          ) : (
            <p className="card text-ink/70">No open vote right now.</p>
          )}

          {runVotes && (
            <>
              <h2 className="pt-3 text-lg font-bold text-ink">
                Run the meeting
              </h2>
              <HeadcountControl
                headcount={state.headcount}
                onChanged={reload}
              />

              <div>
                <button
                  type="button"
                  onClick={() => {
                    setClosedResult(null);
                    setDialogOpen(true);
                  }}
                  disabled={!state.headcount || state.current !== null}
                  className="btn-main w-full py-4 text-base shadow-md"
                >
                  Open a vote
                </button>
                {!state.headcount && (
                  <p className="mt-1 text-sm text-ink/60">
                    Set who is present first.
                  </p>
                )}
                {state.headcount && state.current && (
                  <p className="mt-1 text-sm text-ink/60">
                    A vote is already open. Close it, or delete it to redo it.
                  </p>
                )}
              </div>

              {state.headcount && (
                <OpenVoteDialog
                  open={dialogOpen}
                  present={state.headcount.presentCount}
                  onClose={() => setDialogOpen(false)}
                  onOpened={() => {
                    setDialogOpen(false);
                    reload();
                  }}
                />
              )}
            </>
          )}

          <h2 className="pt-3 text-lg font-bold text-ink">Recent results</h2>
          {state.past.length === 0 ? (
            <p className="text-ink/70">No votes have been closed yet.</p>
          ) : (
            <ul className="space-y-2">
              {state.past.slice(0, sessionsShown).map((session, index) => {
                // Keyed by the session's first vote, which stays put when later votes join.
                const key = session.votes[0].id;
                return (
                  <SessionCard
                    key={key}
                    session={session}
                    // Until someone taps it, only the newest session is open.
                    open={sessionOpen[key] ?? index === 0}
                    onToggle={() =>
                      setSessionOpen((prev) => ({
                        ...prev,
                        [key]: !(prev[key] ?? index === 0),
                      }))
                    }
                  >
                    {session.votes.map((vote) => (
                      <PastVoteRow
                        key={vote.id}
                        vote={vote}
                        onDetails={
                          seeDetails ? () => setDetailsFor(vote.id) : undefined
                        }
                        onDelete={
                          runVotes
                            ? () => void handleDeletePast(vote)
                            : undefined
                        }
                      />
                    ))}
                  </SessionCard>
                );
              })}
            </ul>
          )}
          {state.past.length > sessionsShown && (
            <button
              type="button"
              onClick={() => setSessionsShown((n) => n + 1)}
              className="mx-auto block py-2 text-sm font-semibold text-gold-400 hover:underline"
            >
              Show more
            </button>
          )}
        </>
      )}
    </main>
  );
}
