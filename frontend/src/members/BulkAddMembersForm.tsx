import type { BulkAddResult, BulkAddStatus } from "@ttapp/shared";
import { useState } from "react";
import type { FormEvent } from "react";
import { addMembersBulk } from "./api.ts";

// Must match MAX_BULK in the backend, which is what really enforces it. Checking here too only
// saves a round trip and gives a clearer message.
const MAX_EMAILS = 100;

// Emails can be pasted separated by commas, semicolons, spaces or new lines.
function parseEmails(text: string): string[] {
  return text.split(/[\s,;]+/).filter(Boolean);
}

const LABELS: Record<BulkAddStatus, { one: string; many: string }> = {
  added: { one: "added", many: "added" },
  restored: { one: "restored", many: "restored" },
  already_member: { one: "already a member", many: "already members" },
  invalid: { one: "invalid", many: "invalid" },
  duplicate: { one: "duplicate", many: "duplicates" },
};
const ORDER: BulkAddStatus[] = [
  "added",
  "restored",
  "already_member",
  "invalid",
  "duplicate",
];

// Why an email was not added, in words an officer can act on.
const REASONS: Partial<Record<BulkAddStatus, string>> = {
  already_member: "already a member",
  invalid: "not a valid email address",
  duplicate: "appeared earlier in the list",
};

// "12 added, 1 restored, 2 already members": only the kinds that happened.
function summarize(results: BulkAddResult[]): string {
  return ORDER.flatMap((status) => {
    const n = results.filter((r) => r.status === status).length;
    if (n === 0) return [];
    return [`${n} ${n === 1 ? LABELS[status].one : LABELS[status].many}`];
  }).join(", ");
}

type Outcome =
  | { kind: "error"; text: string }
  | { kind: "done"; summary: string; notAdded: BulkAddResult[] };

// Paste a list of emails and add everyone at once. The good ones are added and the bad ones
// reported, so one typo never blocks the rest. Afterwards the box holds only the invalid
// addresses, so the officer can fix those and press the button again. onChanged refreshes
// the list.
export default function BulkAddMembersForm({
  onChanged,
}: {
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const emails = parseEmails(text);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (emails.length === 0) return;
    if (emails.length > MAX_EMAILS) {
      setOutcome({
        kind: "error",
        text: `Add at most ${MAX_EMAILS} emails at a time. You pasted ${emails.length}.`,
      });
      return;
    }
    setBusy(true);
    setOutcome(null);
    const result = await addMembersBulk(emails);
    setBusy(false);
    if (!result.ok) {
      // Nothing was added, and the text stays so it can be sent again.
      setOutcome({ kind: "error", text: result.message });
      return;
    }
    setOutcome({
      kind: "done",
      summary: summarize(result.results),
      notAdded: result.results.filter(
        (r) => r.status !== "added" && r.status !== "restored",
      ),
    });
    // Keep only what still needs fixing.
    setText(
      result.results
        .filter((r) => r.status === "invalid")
        .map((r) => r.email)
        .join("\n"),
    );
    if (
      result.results.some(
        (r) => r.status === "added" || r.status === "restored",
      )
    ) {
      onChanged();
    }
  }

  return (
    <details className="card mb-6">
      <summary className="cursor-pointer font-bold text-ink">
        Add many at once
      </summary>
      <form onSubmit={handleSubmit} className="mt-2">
        <label htmlFor="bulk-emails" className="mb-1 block text-sm text-ink/70">
          Paste emails, up to {MAX_EMAILS} at a time.
        </label>
        <textarea
          id="bulk-emails"
          rows={6}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={busy}
          placeholder={"name1@example.com\nname2@example.com"}
          className="field"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || emails.length === 0}
            className="btn-main px-6 py-3"
          >
            {busy ? "Adding…" : "Add all"}
          </button>
          <span className="text-sm text-ink/60">
            {emails.length} {emails.length === 1 ? "email" : "emails"}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink/60">
          No invite is sent. Let them know.
        </p>

        {outcome?.kind === "error" && (
          <p role="alert" className="mt-2 text-sm text-red-300">
            {outcome.text}
          </p>
        )}
        {outcome?.kind === "done" && (
          <div role="status" className="mt-2 text-sm">
            <p className="font-medium text-green-300">{outcome.summary}.</p>
            {outcome.notAdded.length > 0 && (
              <>
                <p className="mt-1 text-ink/70">Not added:</p>
                <ul className="mt-1 list-disc pl-5 text-ink">
                  {outcome.notAdded.map((item, index) => (
                    <li key={`${item.email}-${index}`}>
                      <span className="break-all">
                        {item.email || "(blank)"}
                      </span>
                      : {REASONS[item.status]}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </form>
    </details>
  );
}
