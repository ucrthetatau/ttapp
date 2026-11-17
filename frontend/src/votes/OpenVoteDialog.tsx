import { VOTE_KIND_INFO, canPass, countedFor, yesNeeded } from "@ttapp/shared";
import type { VoteKind } from "@ttapp/shared";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import AbstainStepper from "./AbstainStepper.tsx";
import { openVote } from "./api.ts";
import ExplainInfo from "./ExplainInfo.tsx";
import Spinner from "../components/Spinner.tsx";

// The "Open a vote" window: a title and which kind of vote it is. The Regent picks a kind, not a
// percentage, so a bylaw number can never be mistyped. Each choice shows how many yeses it would
// need with the current number present, and the info button shows the working.
//
// Three base choices are listed: Majority, Midway and Final. Midway and Final each have a
// dropdown for overturning that result, because the bylaws' overturn votes only exist relative
// to a midway or a final (open a discussion to overturn, then the overturn vote itself).
// Majority has no overturn votes.

type Base = "majority" | "midway" | "final";
type Variant = "regular" | "discussion" | "overturn";

const BASES: Base[] = ["majority", "midway", "final"];

// Which of the six vote kinds the two choices add up to.
function kindFor(base: Base, variant: Variant): VoteKind {
  if (base === "majority" || variant === "regular") return base;
  if (variant === "discussion") return "discussion";
  return base === "midway" ? "overturn_midway" : "overturn_final";
}

// The bylaw share a kind needs, as the Regent says it out loud: "75%", "90% + 1" (one more yes on
// top, for overturning a final), or "over 50%" for a plain majority. Read from the shared rules,
// so it can never differ from how the vote is counted.
function percentOf(kind: VoteKind): string {
  const info = VOTE_KIND_INFO[kind];
  if (info.rule.type === "moreThanHalf") return "over 50%";
  return info.rule.type === "atLeastPlusOne"
    ? `${info.percent}% + 1`
    : `${info.percent}%`;
}

// Short on purpose: "8 yes needed". `counted` is the number present minus the abstainers, what
// the vote is measured against. The full working is behind the info button.
function needs(kind: VoteKind, counted: number): string {
  return canPass(kind, counted)
    ? `${yesNeeded(kind, counted)} yes needed`
    : `${yesNeeded(kind, counted)} yes needed, can't pass`;
}

export default function OpenVoteDialog({
  open,
  present,
  onClose,
  onOpened,
}: {
  open: boolean;
  present: number;
  onClose: () => void;
  onOpened: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState("");
  const [base, setBase] = useState<Base>("midway");
  const [variant, setVariant] = useState<Variant>("regular");
  const kind = kindFor(base, variant);
  // How many of those present are sitting this vote out. Starts at 0 for every vote. If the
  // headcount shrinks while the window is open, it is capped so one member is always counted.
  const [abstainRaw, setAbstain] = useState(0);
  const abstain = Math.min(abstainRaw, Math.max(0, present - 1));
  const counted = countedFor(present, abstain);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The browser's own <dialog> gives the dark backdrop, Escape to close and focus trapping. It is
  // a centered card, like the new-announcement window.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Start with focus on the card itself, not on the close button (which would show a focus
      // ring the moment the window opens). It also keeps the phone keyboard from popping up
      // before anything is tapped. Tab still reaches every field.
      card.current?.focus({ preventScroll: true });
    }
    if (!open && el.open) el.close();
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === "") {
      setError("Give the vote a title.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await openVote(title.trim(), kind, abstain);
    setBusy(false);
    if (result.ok) {
      setTitle("");
      setBase("midway");
      setVariant("regular");
      setAbstain(0);
      onOpened();
    } else {
      setError(result.message);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      // A click on the dialog element itself (not on the card inside it) is a click on the
      // dimmed backdrop.
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
      aria-labelledby="open-vote-title"
      className="fade-modal m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border-0 bg-transparent p-0 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop:bg-maroon-900/50"
    >
      <form
        ref={card}
        tabIndex={-1}
        onSubmit={submit}
        className="relative space-y-4 rounded-3xl border border-line bg-surface px-5 pt-5 pb-5 outline-none"
      >
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label="Close"
          className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-gold-tint hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 id="open-vote-title" className="pr-10 text-lg font-bold text-ink">
          Open a vote
        </h2>

        <div>
          <label
            htmlFor="vote-title"
            className="mb-2 block text-sm font-semibold"
          >
            Title
          </label>
          <input
            id="vote-title"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Jordan Lee midway"
            className="field"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Kind of vote</legend>
          <div className="space-y-2">
            {BASES.map((b) => (
              <label
                key={b}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                  base === b
                    ? "border-gold-400 bg-gold-tint"
                    : "border-line bg-surface"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={b}
                  checked={base === b}
                  onChange={() => {
                    setBase(b);
                    setVariant("regular");
                  }}
                  className="mt-1 accent-gold-400"
                />
                <span>
                  <span className="font-medium text-ink">
                    {VOTE_KIND_INFO[b].label}
                  </span>
                  <span className="block text-ink/60">{needs(b, counted)}</span>
                </span>
              </label>
            ))}
          </div>

          {base !== "majority" && (
            <div className="mt-3">
              <label
                htmlFor="vote-variant"
                className="mb-2 block text-sm font-semibold"
              >
                Which {base} vote?
              </label>
              <select
                id="vote-variant"
                value={variant}
                onChange={(event) => setVariant(event.target.value as Variant)}
                className="field text-sm"
              >
                <option value="regular">
                  Regular · {percentOf(kindFor(base, "regular"))}
                </option>
                <option value="discussion">
                  Discussion to overturn · {percentOf("discussion")}
                </option>
                <option value="overturn">
                  Overturn · {percentOf(kindFor(base, "overturn"))}
                </option>
              </select>
            </div>
          )}

          <div className="relative mt-3 pr-10">
            <p className="text-sm text-ink/80">
              <span className="font-semibold text-ink">
                {VOTE_KIND_INFO[kind].label}
              </span>
              : {yesNeeded(kind, counted)} yes of {counted}{" "}
              {abstain > 0 ? "counted" : "present"}
            </p>
            <ExplainInfo
              kind={kind}
              present={present}
              abstained={abstain}
              corner="top-0 right-0"
            />
          </div>
        </fieldset>

        <AbstainStepper
          value={abstain}
          max={Math.max(0, present - 1)}
          onChange={setAbstain}
          disabled={busy}
        />

        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-main flex w-full items-center justify-center gap-2 py-3.5 text-base"
        >
          {busy && <Spinner />}
          {busy ? "Opening…" : "Open vote"}
        </button>
      </form>
    </dialog>
  );
}
