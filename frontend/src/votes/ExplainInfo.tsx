import { explain } from "@ttapp/shared";
import type { VoteKind } from "@ttapp/shared";

// The "info" button: shows the arithmetic behind a vote, in plain words. The text comes from
// explain() in the shared rules, the same numbers the backend counts with, so what is shown
// here can never differ from how the vote is decided.
//
// `yes` is only passed where the viewer is allowed to see the split (the Regent's details
// view). Members get the rule, the working and the number needed, never the yes count.
export default function ExplainInfo({
  kind,
  present,
  yes,
  tiebreak,
}: {
  kind: VoteKind;
  present: number;
  yes?: number;
  tiebreak?: "yes" | "no";
}) {
  const info = explain(kind, present, yes, tiebreak);
  return (
    <details className="group mt-2 text-sm text-ink/80">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-maroon-500">
        <span
          aria-hidden="true"
          className="grid h-5 w-5 place-items-center rounded-full border border-maroon-500 text-xs font-bold"
        >
          i
        </span>
        How is this decided?
      </summary>
      <div className="mt-2 space-y-1 rounded-lg border border-line bg-gold-tint px-3 py-2">
        <p>{info.rule}</p>
        <p>{info.working}</p>
        <p className="font-medium text-ink">{info.needed}</p>
        {info.outcome && <p className="font-medium text-ink">{info.outcome}</p>}
      </div>
    </details>
  );
}
