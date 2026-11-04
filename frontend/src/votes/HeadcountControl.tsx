import { QUORUM_PERCENT } from "@ttapp/shared";
import type { HeadcountResponse } from "@ttapp/shared";
import { useState } from "react";
import type { FormEvent } from "react";
import { setHeadcount } from "./api.ts";

// "Who is present": the Regent says how many members are in the room, once for the meeting.
// Every vote is measured against this number (bylaws: percentages are of those present), so a
// vote cannot be opened without it. It can be changed at any time, for example when someone
// leaves in the middle of deliberation, and an open vote follows the new number.
//
// It expires by itself after 90 minutes with no activity, so a number left over from an earlier
// meeting never counts. Quorum is only a warning here: the Scribe makes the official check.
export default function HeadcountControl({
  headcount,
  onChanged,
}: {
  headcount: HeadcountResponse;
  onChanged: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
      setError("Enter how many members are present, as a whole number.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await setHeadcount(number);
    setBusy(false);
    if (result.ok) {
      setValue("");
      onChanged();
    } else {
      setError(result.message);
    }
  }

  return (
    <section
      aria-label="Who is present"
      className="rounded-lg border border-line bg-white px-4 py-4"
    >
      <h2 className="font-bold text-ink">Who is present</h2>
      {headcount ? (
        <p className="mt-1 text-sm text-ink/70">
          <span className="font-semibold text-ink">
            {headcount.presentCount} present.
          </span>{" "}
          This counts until{" "}
          {new Date(headcount.expiresAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          unless a vote opens or closes first.
        </p>
      ) : (
        <p className="mt-1 text-sm text-ink/70">
          Not set. Enter how many members are present before opening a vote.
        </p>
      )}
      {headcount && !headcount.quorumMet && (
        <p className="mt-2 rounded-lg bg-gold-tint px-3 py-2 text-sm text-ink/80">
          That is under the {QUORUM_PERCENT}% of members needed for quorum. The
          Scribe makes the official check.
        </p>
      )}

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <label htmlFor="present-count" className="sr-only">
          Number of members present
        </label>
        <input
          id="present-count"
          type="number"
          min={1}
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={headcount ? "Change to…" : "Number here"}
          className="w-44 rounded border border-line px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy || value === ""}
          className="rounded border border-maroon-500 px-4 py-2 text-sm font-semibold text-maroon-500 hover:bg-gold-tint disabled:opacity-60"
        >
          {headcount ? "Update" : "Set"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
