import type { RemindersPreviewResponse } from "@ttapp/shared";
import { useEffect, useState } from "react";
import DetailsDialog from "../DetailsDialog.tsx";
import { formatDueDate, formatMoney } from "../format.ts";
import { loadReminders, sendReminders, sendTestReminder } from "./api.ts";

type Preview = Extract<RemindersPreviewResponse, { configured: true }>;

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "notConfigured" }
  | { status: "loaded"; preview: Preview };

type Sent = { reminded: number; notDelivered: string[] };

// Today as 2026-11-15 in the officer's own time zone (the same shape the date field uses).
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// What is inside the pop-up. It only exists while the pop-up is open (DetailsDialog renders
// its children only then), so opening it reads the sheet fresh and closing it throws the
// state away: a half-typed date or an old list can never be sent later by accident.
function RemindersBody({ onClose }: { onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadReminders().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoad({ status: "error", message: result.message });
      } else if (!result.data.configured) {
        setLoad({ status: "notConfigured" });
      } else {
        setLoad({ status: "loaded", preview: result.data });
        // Start from the date used last time so a second round needs no typing, but only if
        // it hasn't passed: an old date would otherwise go out by accident.
        const lastDate = result.data.last?.dueDate ?? "";
        setDueDate(lastDate >= today() ? lastDate : "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSend() {
    setBusy(true);
    setError(null);
    const result = await sendReminders(dueDate);
    setBusy(false);
    if (result.ok) setSent(result.result);
    else setError(result.message);
  }

  // The same notification, only to the officer's own devices, to see how it looks first.
  async function handleTest() {
    setBusy(true);
    setError(null);
    setTestNote(null);
    const result = await sendTestReminder(dueDate);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const { devices, usedSample } = result.result;
    setTestNote(
      `Test sent to ${devices === 1 ? "your device" : `${devices} of your devices`}${
        usedSample ? " with a sample amount." : "."
      }`,
    );
  }

  let content;
  if (load.status === "loading") {
    content = <p className="text-ink/70">Reading the dues sheet…</p>;
  } else if (load.status === "error") {
    content = <p role="alert">{load.message}</p>;
  } else if (load.status === "notConfigured") {
    content = <p className="text-ink/70">Set the dues sheet first.</p>;
  } else if (sent) {
    content = (
      <>
        <p className="text-4xl font-extrabold text-gold-400">{sent.reminded}</p>
        <p className="mb-3 text-sm font-semibold text-green-300">
          {sent.reminded === 1 ? "member reminded" : "members reminded"}
        </p>
        {sent.notDelivered.length > 0 && (
          <p className="text-sm text-ink/70">
            Nothing reached {sent.notDelivered.join(", ")}. Text them instead.
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="btn-main mt-5 w-full"
        >
          Done
        </button>
      </>
    );
  } else {
    const { preview } = load;
    const count = preview.willRemind.length;
    const cannot =
      preview.noDevice.length +
      preview.noRow.length +
      preview.unclear.length +
      preview.unreadable.length;
    const example = preview.willRemind[0]?.owes ?? 0;
    content = (
      <>
        <label htmlFor="remind-due" className="mb-1 block text-sm text-ink/70">
          Due date
        </label>
        <input
          id="remind-due"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          disabled={busy}
          className="field"
        />
        {preview.last && (
          <p className="mt-1 text-xs text-ink/60">
            Last sent{" "}
            {new Date(preview.last.sentAt).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            {preview.last.sentBy ? ` by ${preview.last.sentBy}` : ""} to{" "}
            {preview.last.reminded}{" "}
            {preview.last.reminded === 1 ? "member" : "members"}
          </p>
        )}

        {count > 0 && (
          <p className="mt-4 rounded-xl bg-gold-tint px-3 py-2 text-sm text-ink">
            You owe {formatMoney(example)} in dues, due{" "}
            {dueDate ? formatDueDate(dueDate) : "…"}.
          </p>
        )}

        <p className="mt-4 mb-1 text-sm font-semibold text-ink">
          Will be notified ({count})
        </p>
        {count === 0 ? (
          <p className="text-sm text-ink/70">
            Nobody who owes dues has notifications on.
          </p>
        ) : (
          <ul className="max-h-44 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {preview.willRemind.map((person) => (
              <li
                key={person.name}
                className="flex justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="text-ink">{person.name}</span>
                <span className="font-semibold text-gold-400">
                  {formatMoney(person.owes)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {(cannot > 0 || preview.noName > 0) && (
          <details className="mt-3 text-sm text-ink/80">
            <summary className="cursor-pointer font-semibold text-ink">
              Can’t be reached ({cannot})
            </summary>
            <div className="mt-2 space-y-2">
              {preview.noDevice.length > 0 && (
                <div>
                  <p className="text-ink/60">
                    Owe, notifications off. Text them:
                  </p>
                  <p>
                    {preview.noDevice
                      .map((p) => `${p.name} (${formatMoney(p.owes)})`)
                      .join(", ")}
                  </p>
                </div>
              )}
              {preview.noRow.length > 0 && (
                <div>
                  <p className="text-ink/60">Not on the dues sheet:</p>
                  <p>{preview.noRow.join(", ")}</p>
                </div>
              )}
              {preview.unclear.length > 0 && (
                <div>
                  <p className="text-ink/60">
                    Same name twice, so not matched:
                  </p>
                  <p>{preview.unclear.join(", ")}</p>
                </div>
              )}
              {preview.unreadable.length > 0 && (
                <div>
                  <p className="text-ink/60">
                    Amount in the sheet isn’t a number:
                  </p>
                  <p>{preview.unreadable.join(", ")}</p>
                </div>
              )}
              {preview.noName > 0 && (
                <p className="text-ink/60">
                  {preview.noName} not signed in yet, so no name to match.
                </p>
              )}
            </div>
          </details>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={busy || !dueDate || count === 0}
          className="btn-main mt-5 w-full"
        >
          {busy
            ? "Sending…"
            : count === 1
              ? "Send to 1 member"
              : `Send to ${count} members`}
        </button>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={busy || !dueDate}
          className="btn-outline mt-2 w-full"
        >
          Send a test to me only
        </button>
        {testNote && (
          <p role="status" className="mt-2 text-sm text-ink/70">
            {testNote}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <p className="mb-3 pr-8 text-xl font-extrabold text-ink">
        Remind everyone who owes
      </p>
      {content}
    </>
  );
}

// One button on the setup page. Pressing it opens a pop-up that shows who would be notified
// and for how much, asks for the due date, and only then sends.
export default function RemindersCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card mb-4 space-y-3">
      <p className="font-bold text-ink">Dues reminder</p>
      <p className="text-sm text-ink/70">
        Notify everyone who still owes dues, each with their own amount.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-main px-6 py-3"
      >
        Remind everyone who owes
      </button>
      <DetailsDialog
        open={open}
        title="Remind everyone who owes"
        onClose={() => setOpen(false)}
      >
        <RemindersBody onClose={() => setOpen(false)} />
      </DetailsDialog>
    </div>
  );
}
