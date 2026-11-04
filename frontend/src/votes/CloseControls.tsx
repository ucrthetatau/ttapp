import type { CurrentVote } from "@ttapp/shared";
import { useState } from "react";
import { closeVote, deleteVote } from "./api.ts";

// What the Regent can do to the open vote: close it and count, or delete it and start over.
//
// Closing is refused by the backend until everyone present has answered (no abstaining), and
// its message says how many have, so it shows here as it is. If a majority vote comes out
// exactly even, the backend answers "tie" and the Regent chooses yes or no, then closes again.
// The Regent decides the tie; they do not add a vote.
export default function CloseControls({
  vote,
  onClosed,
  onDeleted,
}: {
  vote: CurrentVote;
  onClosed: (id: string, result: "pass" | "fail") => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tie, setTie] = useState(false);

  async function close(tiebreak?: "yes" | "no") {
    setBusy(true);
    setError(null);
    const result = await closeVote(vote.id, tiebreak);
    setBusy(false);
    if (result.ok) {
      setTie(false);
      onClosed(vote.id, result.result);
    } else if (result.tie) {
      setTie(true);
    } else {
      setTie(false);
      setError(result.message);
    }
  }

  function handleClose() {
    if (
      window.confirm(
        `Close "${vote.title}" and count the votes? This can't be undone.`,
      )
    ) {
      void close();
    }
  }

  function handleTiebreak(choice: "yes" | "no") {
    const word = choice === "yes" ? "pass" : "fail";
    if (window.confirm(`Break the tie as ${choice}? The vote will ${word}.`)) {
      void close(choice);
    }
  }

  async function handleDelete() {
    const ok = window.confirm(
      `Delete "${vote.title}"? The vote and all its answers are removed, and a new vote can be opened. This can't be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const result = await deleteVote(vote.id);
    setBusy(false);
    if (result.ok) onDeleted();
    else setError(result.message);
  }

  return (
    <section
      aria-label="Run this vote"
      className="rounded-lg border border-line bg-white px-4 py-4"
    >
      <h2 className="font-bold text-ink">Run this vote</h2>
      <p className="mt-1 text-sm text-ink/70">
        {vote.answered} of {vote.presentCount} present have answered. Closing
        waits until everyone present has answered.
      </p>

      {tie && (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-3">
          <p className="text-sm font-medium text-ink">
            It's a tie. As Regent, you break it.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => handleTiebreak("yes")}
              disabled={busy}
              className="flex-1 rounded border border-maroon-500 bg-white px-3 py-2 text-sm font-semibold text-maroon-500 hover:bg-gold-tint disabled:opacity-60"
            >
              Yes (it passes)
            </button>
            <button
              type="button"
              onClick={() => handleTiebreak("no")}
              disabled={busy}
              className="flex-1 rounded border border-maroon-500 bg-white px-3 py-2 text-sm font-semibold text-maroon-500 hover:bg-gold-tint disabled:opacity-60"
            >
              No (it fails)
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="flex-1 rounded bg-maroon-500 px-4 py-2 text-sm font-semibold text-gold-300 hover:bg-maroon-700 disabled:opacity-60"
        >
          Close vote
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={busy}
          className="rounded border border-line px-4 py-2 text-sm text-red-800 hover:bg-red-50 disabled:opacity-60"
        >
          Delete and redo
        </button>
      </div>
    </section>
  );
}
