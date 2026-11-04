import { VOTE_KIND_INFO, canPass } from "@ttapp/shared";
import type { CurrentVote } from "@ttapp/shared";
import { useState } from "react";
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
}: {
  vote: CurrentVote;
  isRegent: boolean;
  onChanged: () => void;
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
      className={`flex-1 rounded-lg border px-4 py-3 font-semibold disabled:opacity-60 ${
        picked
          ? "border-maroon-500 bg-maroon-500 text-gold-300"
          : "border-line bg-white text-ink hover:bg-gold-tint"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section
      aria-label="Open vote"
      className="rounded-lg border border-line bg-white px-4 py-4"
    >
      <p className="text-sm font-medium text-maroon-500">
        {VOTE_KIND_INFO[vote.kind].label}
      </p>
      <h2 className="mt-0.5 text-lg font-bold text-ink">{vote.title}</h2>
      <p className="mt-1 text-sm text-ink/70">
        {canPass(vote.kind, vote.presentCount)
          ? `Needs ${vote.yesNeeded} yes of ${vote.presentCount} present.`
          : `Needs ${vote.yesNeeded} yes, but only ${vote.presentCount} are present, so it cannot pass.`}
      </p>
      <p className="text-sm text-ink/70">
        {vote.answered} of {vote.totalMembers} answered
      </p>

      <ExplainInfo kind={vote.kind} present={vote.presentCount} />

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {vote.canAnswer ? (
        <div className="mt-4 flex gap-3">
          {button("Yes", true, vote.myAnswer === "yes")}
          {button("No", false, vote.myAnswer === "no")}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-gold-tint px-3 py-2 text-sm text-ink/80">
          {isRegent
            ? "The Regent counts the votes and does not vote."
            : "You can't answer this vote. Ask an officer if that looks wrong."}
        </p>
      )}
      {vote.canAnswer && vote.myAnswer !== "none" && (
        <p className="mt-2 text-sm text-ink/60">
          You answered {vote.myAnswer}. You can change it until the vote closes.
        </p>
      )}
    </section>
  );
}
