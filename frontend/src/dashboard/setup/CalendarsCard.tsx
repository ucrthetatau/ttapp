import type { DashboardSource } from "@ttapp/shared";
import { useState } from "react";
import type { FormEvent } from "react";
import { addCalendar, removeSource } from "./api.ts";

// The Google Calendars the dashboard reads events from. Each needs a short label (shown next
// to its events) and its Calendar ID. The backend reads one event first, so a calendar that
// isn't shared with the service account is refused with a clear message.
export default function CalendarsCard({
  calendars,
  onChanged,
}: {
  calendars: DashboardSource[];
  onChanged: () => void;
}) {
  const [label, setLabel] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    const result = await addCalendar(label, calendarId);
    setBusy(false);
    if (!result.ok) {
      setNote({ kind: "error", text: result.message });
      return;
    }
    setNote({
      kind: "ok",
      text: `Added. Reading “${result.saved.report.name}”.`,
    });
    setLabel("");
    setCalendarId("");
    onChanged();
  }

  async function handleRemove(source: DashboardSource) {
    const ok = window.confirm(
      `Stop showing events from “${source.label}”? Nothing changes in Google.`,
    );
    if (!ok) return;
    const result = await removeSource(source.id);
    if (!result.ok) {
      setNote({ kind: "error", text: result.message });
      return;
    }
    setNote(null);
    onChanged();
  }

  return (
    <div className="card mb-4 space-y-3">
      <p className="font-bold text-ink">Calendars</p>
      {calendars.length === 0 ? (
        <p className="text-sm text-ink/70">None yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {calendars.map((calendar) => (
            <li
              key={calendar.id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <span className="font-semibold text-ink">{calendar.label}</span>
              <button
                type="button"
                onClick={() => void handleRemove(calendar)}
                className="btn-small"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="space-y-3">
        <input
          aria-label="Calendar label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label, for example Chapter"
          required
          maxLength={40}
          disabled={busy}
          className="field disabled:opacity-60"
        />
        <input
          aria-label="Calendar ID"
          value={calendarId}
          onChange={(event) => setCalendarId(event.target.value)}
          placeholder="Calendar ID"
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          className="field disabled:opacity-60"
        />
        <p className="text-xs text-ink/60">
          In Google Calendar: settings for that calendar, then Integrate
          calendar.
        </p>
        <button
          type="submit"
          disabled={busy || calendars.length >= 10}
          className="btn-main px-6 py-3"
        >
          {busy ? "Checking…" : "Add calendar"}
        </button>
      </form>
      {note && (
        <p
          role={note.kind === "error" ? "alert" : "status"}
          className={`text-sm ${note.kind === "error" ? "text-red-300" : "text-green-300"}`}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
