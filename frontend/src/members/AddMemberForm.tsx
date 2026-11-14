import { useState } from "react";
import type { FormEvent } from "react";
import { addMember } from "./api.ts";

type Note = { kind: "ok" | "error"; text: string };

// One email box. The backend decides what counts as valid and whether the person is new,
// already a member, or a removed member coming back. onChanged refreshes the list.
export default function AddMemberForm({
  onChanged,
}: {
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    const result = await addMember(email);
    setBusy(false);
    if (!result.ok) {
      setNote({ kind: "error", text: result.message });
      return;
    }
    setNote({
      kind: "ok",
      text: result.restored
        ? `Restored ${result.email}.`
        : `Added ${result.email}.`,
    });
    setEmail("");
    onChanged();
  }

  return (
    <form onSubmit={handleSubmit} className="card mb-4">
      <label
        htmlFor="new-member-email"
        className="mb-2 block font-bold text-ink"
      >
        Add a member
      </label>
      <div className="flex gap-2">
        <input
          id="new-member-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          className="field min-w-0 flex-1"
        />
        <button type="submit" disabled={busy} className="btn-main px-6 py-3">
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="mt-1 text-sm text-ink/60">
        No invite is sent. Let them know.
      </p>
      {note && (
        <p
          role={note.kind === "error" ? "alert" : "status"}
          className={`mt-2 text-sm ${note.kind === "error" ? "text-red-300" : "text-green-300"}`}
        >
          {note.text}
        </p>
      )}
    </form>
  );
}
