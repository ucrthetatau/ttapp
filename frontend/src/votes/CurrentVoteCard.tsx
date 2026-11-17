import { VOTE_KIND_INFO, canPass, countedFor } from "@ttapp/shared";
import type { CurrentVote } from "@ttapp/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { answerVote } from "./api.ts";
import ExplainInfo from "./ExplainInfo.tsx";
import Spinner from "../components/Spinner.tsx";
import { useFlash } from "../components/useFlash.ts";

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
  // Which button was tapped, so the spinner shows on that one while the answer is sent.
  const [sending, setSending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the vote is measured against: present minus the abstainers the Regent set.
  const counted = countedFor(vote.presentCount, vote.abstainCount);
  // The "answered" line glows when someone else's answer comes in over the live update.
  const answeredChanged = useFlash(vote.answered);

  async function answer(value: boolean) {
    setBusy(true);
    setSending(value);
    setError(null);
    const result = await answerVote(value);
    setBusy(false);
    setSending(null);
    if (result.ok) onChanged();
    else setError(result.message);
  }

  // Big pills like a ballot: YES in gold, NO in a cream outline. Once you have answered, your
  // answer gets a check mark and a ring, and the other one fades back. You can still change it.
  const button = (
    label: string,
    value: boolean,
    picked: boolean,
    other: boolean,
  ) => (
    <button
      type="button"
      onClick={() => void answer(value)}
      disabled={busy}
      aria-pressed={picked}
      className={`flex w-full items-center justify-center gap-2 rounded-full border-2 py-4 text-2xl font-extrabold tracking-wide uppercase transition disabled:opacity-60 ${
        value
          ? "border-gold-400 bg-gold-400 text-maroon-900 hover:bg-gold-300"
          : "border-ink bg-transparent text-ink hover:bg-gold-tint"
      } ${picked ? "ring-4 ring-ink/30" : ""} ${other ? "opacity-60" : ""}`}
    >
      {sending === value && <Spinner />}
      {picked && sending !== value && (
        <svg
          className="pop"
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
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      )}
      {label}
    </button>
  );

  return (
    <section aria-label="Open vote" className="card relative">
      <span className="badge">{VOTE_KIND_INFO[vote.kind].label}</span>
      <h2 className="mt-3 text-xl font-bold text-ink">{vote.title}</h2>
      <p className="mt-1 text-sm text-ink/70">
        {canPass(vote.kind, counted)
          ? vote.abstainCount > 0
            ? `Needs ${vote.yesNeeded} yes of ${counted} counted · ${vote.abstainCount} abstaining`
            : `Needs ${vote.yesNeeded} yes of ${vote.presentCount} present.`
          : `Needs ${vote.yesNeeded} yes, but only ${counted} are ${vote.abstainCount > 0 ? "counted" : "present"}, so it cannot pass.`}
      </p>

      <div className="mt-5">
        <div
          role="progressbar"
          aria-label="Answered"
          aria-valuemin={0}
          aria-valuemax={counted}
          aria-valuenow={vote.answered}
          className="h-1.5 w-full overflow-hidden rounded-full bg-gold-tint"
        >
          <div
            className="h-full rounded-full bg-gold-400 transition-[width] duration-500"
            style={{
              width: `${counted > 0 ? Math.min(100, (vote.answered / counted) * 100) : 0}%`,
            }}
          />
        </div>
        <p
          className={`mx-auto mt-2 w-fit px-2 text-center text-xs font-medium text-ink/60 tabular-nums ${
            answeredChanged ? "flash" : ""
          }`}
        >
          {vote.answered} of {counted} answered
        </p>
      </div>

      <ExplainInfo
        kind={vote.kind}
        present={vote.presentCount}
        abstained={vote.abstainCount}
      />

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {vote.canAnswer ? (
        <div className="mt-4 flex flex-col gap-3">
          {button("Yes", true, vote.myAnswer === "yes", vote.myAnswer === "no")}
          {button("No", false, vote.myAnswer === "no", vote.myAnswer === "yes")}
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
