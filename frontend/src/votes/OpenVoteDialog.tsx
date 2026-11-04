import { VOTE_KIND_INFO, canPass, yesNeeded } from "@ttapp/shared";
import type { VoteKind } from "@ttapp/shared";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { openVote } from "./api.ts";
import ExplainInfo from "./ExplainInfo.tsx";

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

function needs(kind: VoteKind, present: number): string {
  return canPass(kind, present)
    ? `needs ${yesNeeded(kind, present)} yes of ${present} present`
    : `needs ${yesNeeded(kind, present)} yes, more than the ${present} present`;
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
  const [title, setTitle] = useState("");
  const [base, setBase] = useState<Base>("midway");
  const [variant, setVariant] = useState<Variant>("regular");
  const kind = kindFor(base, variant);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The browser's own <dialog> gives the dark backdrop, Escape to close and focus trapping.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
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
    const result = await openVote(title.trim(), kind);
    setBusy(false);
    if (result.ok) {
      setTitle("");
      setBase("midway");
      setVariant("regular");
      onOpened();
    } else {
      setError(result.message);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="open-vote-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl p-0 backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <h2 id="open-vote-title" className="text-lg font-bold text-maroon-500">
          Open a vote
        </h2>

        <div>
          <label
            htmlFor="vote-title"
            className="mb-1 block text-sm font-medium"
          >
            Title
          </label>
          <input
            id="vote-title"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Jordan Lee midway"
            className="w-full rounded border border-line px-3 py-2"
          />
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">Kind of vote</legend>
          <div className="space-y-1.5">
            {BASES.map((b) => (
              <label
                key={b}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  base === b ? "border-maroon-500 bg-gold-tint" : "border-line"
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
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-ink">
                    {VOTE_KIND_INFO[b].label}
                  </span>
                  <span className="block text-ink/60">{needs(b, present)}</span>
                </span>
              </label>
            ))}
          </div>

          {base !== "majority" && (
            <div className="mt-3">
              <label
                htmlFor="vote-variant"
                className="mb-1 block text-sm font-medium"
              >
                Overturning a previous {base} result?
              </label>
              <select
                id="vote-variant"
                value={variant}
                onChange={(event) => setVariant(event.target.value as Variant)}
                className="w-full rounded border border-line bg-white px-3 py-2 text-sm"
              >
                <option value="regular">
                  No, a regular {base} vote ({needs(base, present)})
                </option>
                <option value="discussion">
                  Open a discussion to overturn ({needs("discussion", present)})
                </option>
                <option value="overturn">
                  Overturn the {base} (
                  {needs(kindFor(base, "overturn"), present)})
                </option>
              </select>
            </div>
          )}

          <p className="mt-3 text-sm text-ink/80">
            This will be a{" "}
            <span className="font-semibold text-ink">
              {VOTE_KIND_INFO[kind].label}
            </span>{" "}
            vote: {needs(kind, present)}.
          </p>
          <ExplainInfo kind={kind} present={present} />
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-line px-4 py-2 text-sm hover:bg-gold-tint"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-maroon-500 px-4 py-2 text-sm font-semibold text-gold-300 hover:bg-maroon-700 disabled:opacity-60"
          >
            Open vote
          </button>
        </div>
      </form>
    </dialog>
  );
}
