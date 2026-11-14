import { VOTE_KIND_INFO, canPass } from "@ttapp/shared";
import type { CurrentVote } from "@ttapp/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { answerVote } from "./api.ts";
import ExplainInfo from "./ExplainInfo.tsx";

// The open vote: what it is, what it needs, how many have answered, and (for members who may
// vote) the Yes and No buttons. Your own answer is highlighted and can be changed while the
// vote is open. Other people's answers are never shown, only how many have answered.
//
// The buttons are hidden when the backend says canAnswer is false, but that is only a courtesy:
// the backend refuses the answer itself, and its message shows here if one slips through.
export default function CurrentVoteCard({
  vote,
  isRegent,
  onChanged,
  controls,
}: {
  vote: CurrentVote;
  isRegent: boolean;
  onChanged: () => void;
  /** The Regent's close and delete buttons, shown at the bottom of this card. */
  controls?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(value: boolean) {
    setBusy(true);
    setError(null);
    const result = await answerVote(value);
    setBusy(false);
    if (result.ok) onChanged();
    else setError(result.message);
  }

  const button = (label: string, value: boolean, picked: boolean) => (
    <button
      type="button"
      onClick={() => void answer(value)}
      disabled={busy}
      aria-pressed={picked}
      className={`flex-1 rounded-full border px-4 py-3.5 text-[15px] font-semibold transition-colors disabled:opacity-60 ${
        picked
          ? "border-gold-400 bg-gold-400 text-maroon-900"
          : "border-line bg-gold-tint text-ink hover:bg-ink/10"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section aria-label="Open vote" className="card relative">
      <span className="badge">{VOTE_KIND_INFO[vote.kind].label}</span>
      <h2 className="mt-3 text-xl font-bold text-ink">{vote.title}</h2>
      <p className="mt-1 text-sm text-ink/70">
        {canPass(vote.kind, vote.presentCount)
          ? `Needs ${vote.yesNeeded} yes of ${vote.presentCount} present.`
          : `Needs ${vote.yesNeeded} yes, but only ${vote.presentCount} are present, so it cannot pass.`}
      </p>

      <div className="mt-5">
        <div
          role="progressbar"
          aria-label="Answered"
          aria-valuemin={0}
          aria-valuemax={vote.presentCount}
          aria-valuenow={vote.answered}
          className="h-1.5 w-full overflow-hidden rounded-full bg-gold-tint"
        >
          <div
            className="h-full rounded-full bg-gold-400 transition-[width] duration-500"
            style={{
              width: `${vote.presentCount > 0 ? Math.min(100, (vote.answered / vote.presentCount) * 100) : 0}%`,
            }}
          />
        </div>
        <p className="mt-2 text-center text-xs font-medium text-ink/60">
          {vote.answered} of {vote.presentCount} answered
        </p>
      </div>

      <ExplainInfo kind={vote.kind} present={vote.presentCount} />

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {vote.canAnswer ? (
        <div className="mt-4 flex gap-3">
          {button("Yes", true, vote.myAnswer === "yes")}
          {button("No", false, vote.myAnswer === "no")}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-gold-tint px-4 py-3 text-sm text-ink/80">
          {isRegent
            ? "The Regent counts the votes and does not vote."
            : "You can't answer this vote. Ask an officer if that looks wrong."}
        </p>
      )}
      {controls}
      {vote.canAnswer && vote.myAnswer !== "none" && (
        <p className="mt-3 text-center text-[13px] text-ink/70">
          You answered {vote.myAnswer}. You can change it until the vote closes.
        </p>
      )}
    </section>
  );
}
