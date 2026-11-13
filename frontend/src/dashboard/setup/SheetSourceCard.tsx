import type { DashboardSource, SourceCheckReport } from "@ttapp/shared";
import { useState } from "react";
import type { FormEvent } from "react";
import { saveSheet, saveThreshold } from "./api.ts";
import ReportView from "./ReportView.tsx";

const COPY = {
  dues: {
    title: "Dues sheet",
    columns: "EMAIL, STATUS, AMOUNT CHARGED, AMOUNT PAID",
  },
  requirements: {
    title: "Requirements sheet",
    columns: "EMAIL, REQ %",
  },
} as const;

// One Google Sheet the dashboard reads. The officer opens the right tab, copies the address
// from the browser bar and pastes it. The backend reads the sheet and checks the template
// BEFORE saving, so a wrong link just shows what is wrong and changes nothing.
export default function SheetSourceCard({
  kind,
  source,
  onChanged,
}: {
  kind: "dues" | "requirements";
  source: DashboardSource | undefined;
  onChanged: () => void;
}) {
  const copy = COPY[kind];
  const [link, setLink] = useState("");
  const [threshold, setThreshold] = useState(String(source?.threshold ?? 80));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    text: string;
    problems: string[];
  } | null>(null);
  const [report, setReport] = useState<SourceCheckReport | null>(null);
  const [thresholdNote, setThresholdNote] = useState<string | null>(null);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    const result = await saveSheet(
      kind,
      link,
      kind === "requirements" ? Number(threshold) : undefined,
    );
    setBusy(false);
    if (!result.ok) {
      setError({ text: result.message, problems: result.problems });
      return;
    }
    setReport(result.saved.report);
    setLink("");
    onChanged();
  }

  async function handleThreshold() {
    setThresholdNote(null);
    const result = await saveThreshold(Number(threshold));
    setThresholdNote(result.ok ? "Saved." : result.message);
    if (result.ok) onChanged();
  }

  return (
    <form onSubmit={handleSave} className="card mb-4 space-y-3">
      <p className="font-bold text-ink">{copy.title}</p>
      {source ? (
        <p className="text-sm text-ink/70">
          Reading{" "}
          <a
            href={source.url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-maroon-500 underline"
          >
            {source.label}
          </a>
        </p>
      ) : (
        <p className="text-sm text-ink/70">Not set yet.</p>
      )}
      <input
        aria-label={`${copy.title} link`}
        type="url"
        value={link}
        onChange={(event) => setLink(event.target.value)}
        placeholder="Paste the tab's address"
        required
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="url"
        disabled={busy}
        className="field disabled:opacity-60"
      />
      <p className="text-xs text-ink/60">
        Open the tab, copy the address bar. Needs columns: {copy.columns}.
      </p>
      {kind === "requirements" && (
        <div className="flex items-center gap-2">
          <label htmlFor="threshold" className="text-sm font-semibold text-ink">
            On track at
          </label>
          <input
            id="threshold"
            type="number"
            min={0}
            max={100}
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            className="field w-24"
          />
          <span className="text-sm">%</span>
          {source && (
            <button
              type="button"
              onClick={() => void handleThreshold()}
              className="btn-small"
            >
              Save
            </button>
          )}
        </div>
      )}
      {thresholdNote && (
        <p role="status" className="text-sm">
          {thresholdNote}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-main px-6 py-3">
        {busy ? "Checking…" : source ? "Replace" : "Save"}
      </button>
      {error && (
        <div role="alert" className="text-sm text-red-800">
          <p>{error.text}</p>
          {error.problems.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {error.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {report && <ReportView report={report} />}
    </form>
  );
}
