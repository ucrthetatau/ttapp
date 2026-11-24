import type {
  DashboardSource,
  SheetTabsResponse,
  SourceCheckReport,
} from "@ttapp/shared";
import { useEffect, useState } from "react";
import { LineSkeleton } from "../../components/Skeleton.tsx";
import { loadTabs, switchTab } from "./api.ts";
import ReportView from "./ReportView.tsx";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: SheetTabsResponse };

// A drop-down of every tab in the saved file, so a new quarter's tab is picked from a list
// instead of pasting a link again. The list is read from Google when the card opens (so a tab
// the treasurer just added is there) and the backend checks the new tab's headers BEFORE it
// changes anything: if they don't fit, the officer sees what is wrong and the old tab stays.
export default function TabPicker({
  kind,
  source,
  onChanged,
  onTitle,
}: {
  kind: "dues" | "requirements";
  source: DashboardSource;
  onChanged: () => void;
  /** Tells the card the tab's name as Google has it now (the saved name goes stale on a rename). */
  onTitle: (title: string | null) => void;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    text: string;
    problems: string[];
  } | null>(null);
  const [report, setReport] = useState<SourceCheckReport | null>(null);

  // Asks again whenever the saved tab changes, so the list always matches what is saved.
  useEffect(() => {
    let cancelled = false;
    void loadTabs(kind).then((result) => {
      if (cancelled) return;
      setLoad(
        result.ok
          ? { status: "loaded", data: result.data }
          : { status: "error", message: result.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [kind, source.tabGid]);

  // The saved name is only what the tab was called when it was saved. The live list knows
  // better, so the card above can show the real name.
  useEffect(() => {
    if (load.status !== "loaded") return;
    onTitle(
      load.data.tabs.find((tab) => tab.gid === load.data.currentGid)?.title ??
        null,
    );
  }, [load, onTitle]);

  async function handlePick(gid: number) {
    setBusy(true);
    setError(null);
    setReport(null);
    const result = await switchTab(kind, gid);
    setBusy(false);
    if (!result.ok) {
      setError({ text: result.message, problems: result.problems });
      return;
    }
    setReport(result.saved.report);
    // Show the new tab at once; the page's reload then confirms it.
    setLoad((prev) =>
      prev.status === "loaded"
        ? { status: "loaded", data: { ...prev.data, currentGid: gid } }
        : prev,
    );
    onChanged();
  }

  if (load.status === "loading") return <LineSkeleton label="Loading tabs" />;
  if (load.status === "error") {
    return (
      <p role="alert" className="text-sm text-red-300">
        Couldn’t list the tabs: {load.message}
      </p>
    );
  }

  const { tabs, currentGid } = load.data;
  const id = `${kind}-tab`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-ink/70">
        Tab being read
      </label>
      <select
        id={id}
        value={currentGid === null ? "" : String(currentGid)}
        disabled={busy}
        onChange={(event) => {
          if (event.target.value !== "")
            void handlePick(Number(event.target.value));
        }}
        className="field disabled:opacity-60"
      >
        {currentGid === null && <option value="">Choose a tab…</option>}
        {tabs.map((tab) => (
          <option key={tab.gid} value={tab.gid}>
            {tab.title}
          </option>
        ))}
      </select>
      {busy && <p className="mt-1 text-xs text-ink/60">Checking the tab…</p>}
      {currentGid === null && (
        <p role="alert" className="mt-1 text-sm text-red-300">
          The tab this was reading no longer exists, so members see “not
          available”. Pick the current one.
        </p>
      )}
      {error && (
        <div role="alert" className="mt-1 text-sm text-red-300">
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
    </div>
  );
}
