import { explain } from "@ttapp/shared";
import type { VoteKind } from "@ttapp/shared";
import InfoToggle from "../components/InfoToggle.tsx";

// The "i" button: shows the arithmetic behind a vote, in plain words. The text comes from
// explain() in the shared rules, the same numbers the backend counts with, so what is shown
// here can never differ from how the vote is decided.
//
// The button sits in the top-right corner of the card around it (see InfoToggle). `corner`
// moves it when a card has its own spacing (the Regent's details panel puts it beside the
// result, because its own Hide button holds the card's corner). `alwaysOpen` shows the working
// with no button; nothing uses it at the moment.
//
// `yes` is only passed where the viewer is allowed to see the split (the Regent's details
// view). Members get the rule, the working and the number needed, never the yes count.
export default function ExplainInfo({
  kind,
  present,
  yes,
  tiebreak,
  abstained,
  alwaysOpen,
  corner,
}: {
  kind: VoteKind;
  present: number;
  yes?: number;
  tiebreak?: "yes" | "no";
  /** How many of those present are not counted (abstaining). Default none. */
  abstained?: number;
  alwaysOpen?: boolean;
  corner?: string;
}) {
  const info = explain(kind, present, yes, tiebreak, abstained);
  const lines = (
    <>
      <p>{info.rule}</p>
      <p>{info.working}</p>
      <p className="font-medium text-ink">{info.needed}</p>
      {info.outcome && <p className="font-medium text-ink">{info.outcome}</p>}
    </>
  );
  if (alwaysOpen) {
    return (
      <div className="mt-3 space-y-1 rounded-xl border border-line bg-gold-tint px-3 py-2 text-sm text-ink/80">
        {lines}
      </div>
    );
  }
  return (
    <InfoToggle label="How is this decided?" corner={corner}>
      {lines}
    </InfoToggle>
  );
}
