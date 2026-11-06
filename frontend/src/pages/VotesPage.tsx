import { VOTE_KIND_INFO } from "@ttapp/shared";
import type { PastVote } from "@ttapp/shared";
import { useState } from "react";
import { useAuth } from "../auth/auth.ts";
import { canRunVotes, canSeeVoteDetails } from "../votes/access.ts";
import { deleteVote } from "../votes/api.ts";
import CloseControls from "../votes/CloseControls.tsx";
import CurrentVoteCard from "../votes/CurrentVoteCard.tsx";
import DetailsPanel from "../votes/DetailsPanel.tsx";
import ExplainInfo from "../votes/ExplainInfo.tsx";
import HeadcountControl from "../votes/HeadcountControl.tsx";
import OpenVoteDialog from "../votes/OpenVoteDialog.tsx";
import { useVotes } from "../votes/useVotes.ts";
import { useVotesDoorbell } from "../votes/useVotesDoorbell.ts";

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
    <li className="rounded-lg border border-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 font-medium text-ink">{vote.title}</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            passed ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"
          }`}
        >
          {passed ? "Passed" : "Did not pass"}
        </span>
      </div>
      <p className="text-sm text-ink/60">
        {VOTE_KIND_INFO[vote.kind].label} ·{" "}
        {new Date(vote.closedAt).toLocaleDateString()} · {vote.answered} of{" "}
        {vote.presentCount} present answered
        {vote.tiebreak && " · tie decided by the Regent"}
      </p>
      <ExplainInfo kind={vote.kind} present={vote.presentCount} />
      {(onDetails || onDelete) && (
        <div className="mt-2 flex gap-2">
          {onDetails && (
            <button
              type="button"
              onClick={onDetails}
              className="rounded border border-maroon-500 px-3 py-1 text-sm text-maroon-500 hover:bg-gold-tint"
            >
              Details
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded border border-line px-3 py-1 text-sm text-red-800 hover:bg-red-50"
            >
              Delete and redo
            </button>
          )}
        </div>
      )}
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [closedResult, setClosedResult] = useState<"pass" | "fail" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-maroon-500">Votes</h1>

      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}

      {state.status === "loading" && <p>Loading votes…</p>}
      {state.status === "error" && <p role="alert">{state.message}</p>}
      {state.status === "loaded" && (
        <>
          {closedResult && (
            <p
              role="status"
              className="rounded-lg border border-line bg-white px-4 py-3 font-medium text-ink"
            >
              Vote closed: {closedResult === "pass" ? "passed" : "did not pass"}
              .
            </p>
          )}
          {seeDetails && detailsFor && (
            <DetailsPanel
              key={detailsFor}
              voteId={detailsFor}
              onHide={() => setDetailsFor(null)}
            />
          )}

          {state.current ? (
            <CurrentVoteCard
              vote={state.current}
              isRegent={isRegent}
              onChanged={reload}
            />
          ) : (
            <p className="rounded-lg border border-line bg-white px-4 py-4 text-ink/70">
              No open vote right now.
            </p>
          )}

          {runVotes && (
            <>
              <h2 className="pt-2 text-lg font-bold text-maroon-500">
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
                  className="w-full rounded-lg bg-maroon-500 px-4 py-3 font-semibold text-gold-300 hover:bg-maroon-700 disabled:opacity-50"
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

              {state.current && (
                <CloseControls
                  vote={state.current}
                  onClosed={handleClosed}
                  onDeleted={reload}
                />
              )}

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

          <h2 className="pt-2 text-lg font-bold text-maroon-500">
            Recent results
          </h2>
          {state.past.length === 0 ? (
            <p className="text-ink/70">No votes have been closed yet.</p>
          ) : (
            <ul className="space-y-2">
              {state.past.map((vote) => (
                <PastVoteRow
                  key={vote.id}
                  vote={vote}
                  onDetails={
                    seeDetails ? () => setDetailsFor(vote.id) : undefined
                  }
                  onDelete={
                    runVotes ? () => void handleDeletePast(vote) : undefined
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
