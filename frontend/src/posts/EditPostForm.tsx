import type { Post } from "@ttapp/shared";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { editPost } from "./api.ts";
import { MAX_POST_LENGTH } from "./limits.ts";

// Replaces the text of a post while its author is editing it. Like the compose box, the
// counter and maxLength only save a round trip; the backend decides what is valid and
// whether this really is the author. onSaved receives the post as the backend saved it.
export default function EditPostForm({
  post,
  onSaved,
  onCancel,
}: {
  post: Post;
  onSaved: (post: Post) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(post.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Start with the cursor at the end of the text, ready to type.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const trimmed = text.trim();
  // Saving words that are already there would change nothing, so the button stays off.
  const canSave = !busy && trimmed.length > 0 && trimmed !== post.body;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const result = await editPost(post.id, text);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved({
      ...post,
      body: result.edit.body,
      editedAt: result.edit.editedAt,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2">
      <textarea
        ref={box}
        aria-label="Edit your post"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_POST_LENGTH}
        rows={4}
        disabled={busy}
        className="w-full rounded border border-line bg-white px-3 py-2 disabled:opacity-60"
      />
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded bg-maroon-700 px-4 py-1 text-sm font-medium text-gold-300 hover:bg-maroon-500 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-line px-4 py-1 text-sm text-ink hover:bg-black/5 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
        <span className="text-sm text-ink/60">
          {text.length} / {MAX_POST_LENGTH}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </form>
  );
}
