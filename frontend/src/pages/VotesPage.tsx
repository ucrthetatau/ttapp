import { VOTE_KIND_INFO } from "@ttapp/shared";
import type { PastVote } from "@ttapp/shared";
import { useAuth } from "../auth/auth.ts";
import CurrentVoteCard from "../votes/CurrentVoteCard.tsx";
import ExplainInfo from "../votes/ExplainInfo.tsx";
import { useVotes } from "../votes/useVotes.ts";

// One finished vote: what it was, how it ended, and turnout. Never the yes/no split or who
// voted what (that is the Regent's private view). The info button explains the rule without
// the yes count.
function PastVoteRow({ vote }: { vote: PastVote }) {
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
    </li>
  );
}

// /votes: the open vote (with Yes and No for members who may vote) and the recent results.
export default function VotesPage() {
  const auth = useAuth();
  const isRegent =
    auth.status === "signedIn" && auth.me.roles.includes("president");
  const { state, reload } = useVotes();

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold text-maroon-500">Votes</h1>

      {state.status === "loading" && <p>Loading votes…</p>}
      {state.status === "error" && <p role="alert">{state.message}</p>}
      {state.status === "loaded" && (
        <>
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

          <h2 className="mb-2 mt-8 text-lg font-bold text-maroon-500">
            Recent results
          </h2>
          {state.past.length === 0 ? (
            <p className="text-ink/70">No votes have been closed yet.</p>
          ) : (
            <ul className="space-y-2">
              {state.past.map((vote) => (
                <PastVoteRow key={vote.id} vote={vote} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
