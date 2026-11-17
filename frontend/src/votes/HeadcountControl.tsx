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
// meeting never counts. There is no quorum warning: the Scribe makes the official check.
//
// The card is kept bare on purpose: a short title with the current number beside it in quiet
// text, and the box. There is no description line to read.
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
    <section aria-label="Voters present" className="card">
      <h2 className="font-bold text-ink">
        Voters Present?
        {headcount && (
          <span className="ml-2 text-sm font-normal text-ink/60">
            Now: {headcount.presentCount}
          </span>
        )}
      </h2>

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
          placeholder="Number here"
          className="field min-w-0 flex-1 text-center text-lg font-bold"
        />
        <button
          type="submit"
          disabled={busy || value === ""}
          className="btn-main px-6 py-3"
        >
          {headcount ? "Update" : "Set"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
