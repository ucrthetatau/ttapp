import { useState } from "react";
import type { FormEvent } from "react";
import { addLink } from "./api.ts";

type Note = { kind: "ok" | "error"; text: string };

// A label and a web address. The backend decides what is valid; this form just shows its
// answer. onChanged refreshes the list.
export default function AddLinkForm({ onChanged }: { onChanged: () => void }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    const result = await addLink(label, url);
    setBusy(false);
    if (!result.ok) {
      setNote({ kind: "error", text: result.message });
      return;
    }
    setNote({ kind: "ok", text: `Added ${result.link.label}.` });
    setLabel("");
    setUrl("");
    onChanged();
  }

  const input = "field disabled:opacity-60";

  return (
    <form onSubmit={handleSubmit} className="card mb-6 space-y-3">
      <p className="font-bold text-ink">Add a link</p>
      <input
        aria-label="Label"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Label, for example Chapter bylaws"
        required
        maxLength={80}
        disabled={busy}
        className={input}
      />
      <input
        aria-label="Web address"
        type="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://"
        required
        // Phones capitalize the first letter, and the backend only accepts a lowercase "https://".
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="url"
        disabled={busy}
        className={input}
      />
      <button type="submit" disabled={busy} className="btn-main w-full">
        {busy ? "Adding…" : "Add link"}
      </button>
      {note && (
        <p
          role={note.kind === "error" ? "alert" : "status"}
          className={`text-sm ${note.kind === "error" ? "text-red-800" : "text-green-800"}`}
        >
          {note.text}
        </p>
      )}
    </form>
  );
}
