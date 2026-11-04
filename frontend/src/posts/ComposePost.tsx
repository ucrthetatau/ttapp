import { useState } from "react";
import type { FormEvent } from "react";
import { createPost } from "./api.ts";
import { MAX_POST_LENGTH } from "./limits.ts";

// The box at the top of the feed. The backend trims the text and enforces the limit again;
// the counter and maxLength here only save people a round trip. onPosted refreshes the feed.
export default function ComposePost({ onPosted }: { onPosted: () => void }) {
  const [text, setText] = useState("");
  const [hasRsvp, setHasRsvp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createPost(text, hasRsvp);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setText("");
    setHasRsvp(false);
    onPosted();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-lg border border-line bg-white p-4"
    >
      <label htmlFor="new-post" className="mb-1 block font-medium text-ink">
        Post to the chapter
      </label>
      <textarea
        id="new-post"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_POST_LENGTH}
        rows={3}
        disabled={busy}
        placeholder="Write something…"
        className="w-full rounded border border-line bg-white px-3 py-2 disabled:opacity-60"
      />
      <div className="mt-1 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={hasRsvp}
            onChange={(event) => setHasRsvp(event.target.checked)}
            disabled={busy}
          />
          Ask for RSVP
        </label>
        <span className="text-sm text-ink/60">
          {text.length} / {MAX_POST_LENGTH}
        </span>
      </div>
      <button
        type="submit"
        disabled={busy || text.trim().length === 0}
        className="mt-3 rounded bg-maroon-700 px-4 py-2 font-medium text-gold-300 hover:bg-maroon-500 disabled:opacity-60"
      >
        {busy ? "Posting…" : "Post"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </form>
  );
}
