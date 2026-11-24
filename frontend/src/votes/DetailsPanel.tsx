import { VOTE_KIND_INFO } from "@ttapp/shared";
import type { VoteDetailsResponse } from "@ttapp/shared";
import { useEffect, useState } from "react";
import { getDetails } from "./api.ts";
import ExplainInfo from "./ExplainInfo.tsx";
import { LineSkeleton } from "../components/Skeleton.tsx";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; details: VoteDetailsResponse };

// The Regent's private view of a closed vote: the exact split, and who answered what. Only the
// president role can load it (the backend refuses everyone else, admins included), and only
// once the vote is closed. The info text here DOES include the yes count, because this viewer
// is allowed to see the split. The page gives this a key of the vote id, so a different vote
// starts again from "loading" instead of resetting state here.
export default function DetailsPanel({ voteId }: { voteId: string }) {
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
    <section aria-label="Vote details">
      {/* The pop-up's own X sits in the corner beside this title. */}
      <h2 className="pr-10 font-bold text-ink">Vote details (private)</h2>

      {state.status === "loading" && (
        <div className="mt-2">
          <LineSkeleton label="Loading" />
        </div>
      )}
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-300">
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
      <p className="mt-2 text-sm text-gold-400">
        {VOTE_KIND_INFO[details.kind].label}
      </p>
      <p className="font-medium text-ink">{details.title}</p>
      {/* The "i" sits beside the result and opens the arithmetic, like every other info note. */}
      <div
        className={`mt-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-2xl font-extrabold tracking-wide text-white uppercase ${
          passed ? "bg-green-700" : "bg-red-700"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          width="32"
          height="32"
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
      <div className="relative mt-3 pr-10">
        <p className="text-sm text-ink/70">
          {details.yes} yes, {details.no} no, of{" "}
          {details.abstainCount > 0
            ? `${details.presentCount - details.abstainCount} counted (${details.presentCount} present, ${details.abstainCount} abstained)`
            : `${details.presentCount} present`}
          .{details.tiebreak && " The tie was decided by the Regent."}
        </p>
        <ExplainInfo
          kind={details.kind}
          present={details.presentCount}
          abstained={details.abstainCount}
          yes={details.yes}
          tiebreak={tiebreak}
          corner="top-1 right-0"
        />
      </div>

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
