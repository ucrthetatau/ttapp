import type { RequirementsPreviewResponse } from "@ttapp/shared";
import { useEffect, useState } from "react";
import DetailsDialog from "../DetailsDialog.tsx";
import { formatNumber } from "../format.ts";
import {
  loadRequirementsReminders,
  sendRequirementsReminders,
  sendTestRequirementsReminder,
} from "./api.ts";
import CannotReach from "./CannotReach.tsx";

type Preview = Extract<RequirementsPreviewResponse, { configured: true }>;

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "notConfigured" }
  | { status: "loaded"; preview: Preview };

type Sent = { reminded: number; notDelivered: string[] };

// What is inside the pop-up. Like the dues one, it exists only while the pop-up is open, so
// every opening reads the sheet fresh. There is no date to pick: the message is just where the
// member stands against the threshold.
function RequirementsBody({ onClose }: { onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadRequirementsReminders().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoad({ status: "error", message: result.message });
      } else if (!result.data.configured) {
        setLoad({ status: "notConfigured" });
      } else {
        setLoad({ status: "loaded", preview: result.data });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSend() {
    setBusy(true);
    setError(null);
    setTestNote(null);
    const result = await sendRequirementsReminders();
    setBusy(false);
    if (result.ok) setSent(result.result);
    else setError(result.message);
  }

  // The same notification, only to the officer's own devices, to see how it looks first.
  async function handleTest() {
    setBusy(true);
    setError(null);
    setTestNote(null);
    const result = await sendTestRequirementsReminder();
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const { devices, usedSample } = result.result;
    setTestNote(
      `Test sent to ${devices === 1 ? "your device" : `${devices} of your devices`}${
        usedSample ? " with a sample percentage." : "."
      }`,
    );
  }

  let content;
  if (load.status === "loading") {
    content = <p className="text-ink/70">Reading the requirements sheet…</p>;
  } else if (load.status === "error") {
    content = <p role="alert">{load.message}</p>;
  } else if (load.status === "notConfigured") {
    content = <p className="text-ink/70">Set the requirements sheet first.</p>;
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
    const example = preview.willRemind[0]?.percent ?? preview.threshold - 15;
    content = (
      <>
        <p className="text-sm text-ink/70">
          Members below {preview.threshold}% get a notification with their own
          percentage.
        </p>
        <p className="mt-3 rounded-xl bg-gold-tint px-3 py-2 text-sm text-ink">
          You’re not meeting requirements: {formatNumber(example)}% (need{" "}
          {preview.threshold}%).
        </p>

        <p className="mt-4 mb-1 text-sm font-semibold text-ink">
          Will be notified ({count})
        </p>
        {count === 0 ? (
          <p className="text-sm text-ink/70">
            Nobody below requirements has notifications on.
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
                  {formatNumber(person.percent)}%
                </span>
              </li>
            ))}
          </ul>
        )}

        <CannotReach
          noDevice={preview.noDevice.map(
            (p) => `${p.name} (${formatNumber(p.percent)}%)`,
          )}
          noDeviceText="Below requirements, notifications off. Text them:"
          noRow={preview.noRow}
          noRowText="Not on the requirements sheet:"
          unclear={preview.unclear}
          unreadable={preview.unreadable}
          unreadableText="Percentage in the sheet isn’t a number:"
          noName={preview.noName}
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={busy || count === 0}
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
          disabled={busy}
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
        Remind members below requirements
      </p>
      {content}
    </>
  );
}

// One button on the setup page, under the requirements sheet. It opens a pop-up that shows who
// is below the threshold and only then sends.
export default function RequirementsRemindersCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card mb-4 space-y-3">
      <p className="font-bold text-ink">Requirements reminder</p>
      <p className="text-sm text-ink/70">
        Notify everyone below the threshold, each with their own percentage.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-main px-6 py-3"
      >
        Remind members below requirements
      </button>
      <DetailsDialog
        open={open}
        title="Remind members below requirements"
        onClose={() => setOpen(false)}
      >
        <RequirementsBody onClose={() => setOpen(false)} />
      </DetailsDialog>
    </div>
  );
}
