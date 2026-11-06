import { VOTE_KIND_INFO } from "@ttapp/shared";
import type { VoteDetailsResponse } from "@ttapp/shared";
import { useEffect, useState } from "react";
import { getDetails } from "./api.ts";
import ExplainInfo from "./ExplainInfo.tsx";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; details: VoteDetailsResponse };

// The Regent's private view of a closed vote: the exact split, and who answered what. Only the
// president role can load it (the backend refuses everyone else, admins included), and only
// once the vote is closed. The info text here DOES include the yes count, because this viewer
// is allowed to see the split. The page gives this a key of the vote id, so a different vote
// starts again from "loading" instead of resetting state here.
export default function DetailsPanel({
  voteId,
  onHide,
}: {
  voteId: string;
  onHide: () => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getDetails(voteId).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "loaded", details: result.details }
          : { status: "error", message: result.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [voteId]);

  return (
    <section
      aria-label="Vote details"
      className="card border-2 border-maroon-500"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-bold text-ink">Vote details (private)</h2>
        <button
          type="button"
          onClick={onHide}
          className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold hover:bg-gold-tint"
        >
          Hide
        </button>
      </div>

      {state.status === "loading" && <p className="mt-2">Loading…</p>}
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {state.message}
        </p>
      )}
      {state.status === "loaded" && <Loaded details={state.details} />}
    </section>
  );
}

function Loaded({ details }: { details: VoteDetailsResponse }) {
  const passed = details.result === "pass";
  const yesNames = details.answers.filter((a) => a.answer).map((a) => a.name);
  const noNames = details.answers.filter((a) => !a.answer).map((a) => a.name);
  // The Regent's tiebreak choice follows from the result: a tie that passed was broken as yes.
  const tiebreak = details.tiebreak ? (passed ? "yes" : "no") : undefined;

  return (
    <>
      <p className="mt-1 text-sm text-maroon-500">
        {VOTE_KIND_INFO[details.kind].label}
      </p>
      <p className="font-medium text-ink">{details.title}</p>
      <p className="mt-1 text-lg font-bold text-ink">
        {passed ? "Passed" : "Did not pass"}
      </p>
      <p className="text-sm text-ink/70">
        {details.yes} yes, {details.no} no, of {details.presentCount} present.
        {details.tiebreak && " The tie was decided by the Regent."}
      </p>

      <ExplainInfo
        kind={details.kind}
        present={details.presentCount}
        yes={details.yes}
        tiebreak={tiebreak}
        alwaysOpen
      />

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="mb-1 font-semibold text-ink">Yes ({yesNames.length})</p>
          <ul className="space-y-0.5 text-ink/80">
            {yesNames.map((name, i) => (
              <li key={`${name}-${i}`}>{name}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 font-semibold text-ink">No ({noNames.length})</p>
          <ul className="space-y-0.5 text-ink/80">
            {noNames.map((name, i) => (
              <li key={`${name}-${i}`}>{name}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
