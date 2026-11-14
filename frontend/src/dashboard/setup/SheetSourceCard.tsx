import type {
  DashboardSource,
  InspectSheetResponse,
  SourceCheckReport,
} from "@ttapp/shared";
import { useState } from "react";
import type { FormEvent } from "react";
import { inspectSheet, saveSheet, saveThreshold } from "./api.ts";
import ReportView from "./ReportView.tsx";

const TITLE = {
  dues: "Dues sheet",
  requirements: "Requirements sheet",
} as const;

// One Google Sheet the dashboard reads, set up in two steps. Step 1: the officer opens the
// right tab, copies the address from the browser bar and pastes it; the backend reads the top
// of the tab and offers its header cells. Step 2: the officer confirms which column is which
// (the best guess is already chosen) and saves. The columns are remembered by their header
// text, so the sheet can be rearranged later. The backend checks everything BEFORE saving, so
// a wrong link or column just shows what is wrong and changes nothing.
export default function SheetSourceCard({
  kind,
  source,
  onChanged,
}: {
  kind: "dues" | "requirements";
  source: DashboardSource | undefined;
  onChanged: () => void;
}) {
  const [link, setLink] = useState("");
  const [inspected, setInspected] = useState<InspectSheetResponse | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [threshold, setThreshold] = useState(String(source?.threshold ?? 80));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    text: string;
    problems: string[];
  } | null>(null);
  const [report, setReport] = useState<SourceCheckReport | null>(null);
  const [thresholdNote, setThresholdNote] = useState<string | null>(null);

  function changeLink(value: string) {
    setLink(value);
    // A different link means different headers, so the old choices no longer apply.
    setInspected(null);
    setChoices({});
  }

  async function handleCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    const result = await inspectSheet(kind, link);
    setBusy(false);
    if (!result.ok) {
      setError({ text: result.message, problems: [] });
      return;
    }
    setInspected(result.inspected);
    setChoices(
      Object.fromEntries(
        result.inspected.roles.map(({ role }) => [
          role,
          result.inspected.suggestions[role] ?? "",
        ]),
      ),
    );
  }

  async function handleSave() {
    if (!inspected) return;
    setBusy(true);
    setError(null);
    const result = await saveSheet(
      kind,
      link,
      choices,
      kind === "requirements" ? Number(threshold) : undefined,
    );
    setBusy(false);
    if (!result.ok) {
      setError({ text: result.message, problems: result.problems });
      return;
    }
    setReport(result.saved.report);
    setLink("");
    setInspected(null);
    setChoices({});
    onChanged();
  }

  async function handleThreshold() {
    setThresholdNote(null);
    const result = await saveThreshold(Number(threshold));
    setThresholdNote(result.ok ? "Saved." : result.message);
    if (result.ok) onChanged();
  }

  const allChosen =
    inspected !== null &&
    inspected.roles.every(({ role }) => (choices[role] ?? "") !== "");

  return (
    <form onSubmit={handleCheck} className="card mb-4 space-y-3">
      <p className="font-bold text-ink">{TITLE[kind]}</p>
      {source ? (
        <div className="text-sm text-ink/70">
          <p>
            Reading{" "}
            <a
              href={source.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-gold-400 underline"
            >
              {source.label}
            </a>
          </p>
          {source.columns && (
            <p className="mt-0.5 text-xs">
              Columns: {Object.values(source.columns).join(" · ")}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink/70">Not set yet.</p>
      )}

      <input
        aria-label={`${TITLE[kind]} link`}
        type="url"
        value={link}
        onChange={(event) => changeLink(event.target.value)}
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
        Open the tab you want and copy the address bar.
      </p>

      {!inspected && (
        <button type="submit" disabled={busy} className="btn-main px-6 py-3">
          {busy ? "Reading…" : source ? "Replace" : "Check sheet"}
        </button>
      )}

      {inspected && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">
            Found “{inspected.tabName}”. Which column is which?
          </p>
          {inspected.roles.map(({ role, label }) => (
            <div key={role}>
              <label
                htmlFor={`${kind}-${role}`}
                className="mb-1 block text-sm text-ink/70"
              >
                {label}
              </label>
              <select
                id={`${kind}-${role}`}
                value={choices[role] ?? ""}
                onChange={(event) =>
                  setChoices({ ...choices, [role]: event.target.value })
                }
                className="field"
              >
                <option value="">Choose…</option>
                {inspected.candidates.map((candidate) => (
                  <option key={candidate.cell} value={candidate.text}>
                    {candidate.cell} · {candidate.text}
                  </option>
                ))}
              </select>
              {role === "person" && choices.person && (
                <p className="mt-1 text-xs text-ink/60">
                  Matched by{" "}
                  {choices.person.trim().toUpperCase() === "EMAIL"
                    ? "email"
                    : "name (from their Google account)"}
                  .
                </p>
              )}
            </div>
          ))}
        </div>
      )}

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
          {source && !inspected && (
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

      {inspected && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || !allChosen}
            className="btn-main px-6 py-3"
          >
            {busy ? "Checking…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => changeLink("")}
            disabled={busy}
            className="btn-outline px-6 py-3"
          >
            Start over
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="text-sm text-red-300">
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
