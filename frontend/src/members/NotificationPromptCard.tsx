import type { NotificationPromptStatus } from "@ttapp/shared";
import { useEffect, useState } from "react";
import { loadPromptStatus, resetPrompt } from "./api.ts";

// For officers: bring the "turn on notifications" pop-up back. Some members skipped it or never
// saw it, and each phone only shows it once. Pressing the button raises a version number; every
// phone that already showed the pop-up shows it again the next time the app opens, but only if
// that member still has notifications off. People who already turned them on aren't bothered.
// Nothing is pushed or rung: it waits for each person's next open.
export default function NotificationPromptCard() {
  const [status, setStatus] = useState<NotificationPromptStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPromptStatus().then((result) => {
      if (cancelled) return;
      if (result.ok) setStatus(result.status);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleReset() {
    const ok = window.confirm(
      "Show the notification pop-up again? Members who haven't turned notifications on will see it the next time they open the app.",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await resetPrompt();
    setBusy(false);
    if (result.ok) {
      setStatus(result.status);
      setNote("Done. It shows the next time each member opens the app.");
    } else {
      setError(result.message);
    }
  }

  return (
    <section aria-label="Notification pop-up" className="card mb-4 space-y-3">
      <p className="font-bold text-ink">Notification pop-up</p>
      <p className="text-sm text-ink/70">
        {status
          ? `${status.withNotifications} of ${status.activeMembers} members have notifications on.`
          : "Checking who has notifications on…"}{" "}
        Show the pop-up again to everyone who doesn’t.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="text-sm text-ink/70">
          {note}
        </p>
      )}
      <button
        type="button"
        onClick={() => void handleReset()}
        disabled={busy}
        className="btn-main px-6 py-3"
      >
        {busy ? "Working…" : "Show the pop-up again"}
      </button>
    </section>
  );
}
