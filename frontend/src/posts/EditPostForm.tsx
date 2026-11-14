import type { Post } from "@ttapp/shared";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { editPost } from "./api.ts";
import { MAX_POST_LENGTH, MAX_TITLE_LENGTH } from "./limits.ts";

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
  const [title, setTitle] = useState(post.title ?? "");
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
  const trimmedTitle = title.trim();
  // A post that has a title keeps one; an older post without may stay without, but then it
  // needs words. Saving what is already there would change nothing, so the button stays off.
  const valid =
    post.title !== null
      ? trimmedTitle.length > 0
      : trimmedTitle.length > 0 || trimmed.length > 0;
  const changed = trimmed !== post.body || trimmedTitle !== (post.title ?? "");
  const canSave = !busy && valid && changed;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const result = await editPost(post.id, title, text);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved({
      ...post,
      title: result.edit.title,
      body: result.edit.body,
      editedAt: result.edit.editedAt,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2">
      <input
        aria-label="Edit the title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={MAX_TITLE_LENGTH}
        placeholder={post.title === null ? "Title (optional)" : "Title"}
        disabled={busy}
        className="field mb-2 font-bold disabled:opacity-60"
      />
      <textarea
        ref={box}
        aria-label="Edit your post"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_POST_LENGTH}
        rows={4}
        placeholder="Details (optional)"
        disabled={busy}
        className="field disabled:opacity-60"
      />
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canSave}
            className="btn-main px-5 py-1.5 text-sm"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-outline border-line px-5 py-1 text-sm text-ink hover:bg-gold-tint"
          >
            Cancel
          </button>
        </div>
        <span className="text-sm text-ink/60">
          {text.length} / {MAX_POST_LENGTH}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
