import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPost } from "./api.ts";
import { MAX_POST_LENGTH, MAX_TITLE_LENGTH } from "./limits.ts";

// Show the character count only when the limit is getting close, so the form stays quiet.
const COUNTER_FROM = Math.floor(MAX_POST_LENGTH * 0.8);

// The control at the top of the feed: a rounded "New post…" bar. Tapping it opens a pop-up
// asking for a title (required) and details (optional), with an "Ask for RSVP" toggle. The
// backend trims the texts and enforces the limits again; the counter and maxLength here only
// save people a round trip. onPosted refreshes the feed.
//
// What was typed is kept if the pop-up is closed without posting, so a tap outside by mistake
// does not lose it. It is cleared once the post goes through.
export default function ComposePost({ onPosted }: { onPosted: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [hasRsvp, setHasRsvp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      titleBox.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createPost(title, text, hasRsvp);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTitle("");
    setText("");
    setHasRsvp(false);
    setOpen(false);
    onPosted();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-full border border-line bg-surface py-2 pr-2 pl-5 text-left text-ink/50 shadow-soft transition-colors hover:border-gold-400"
      >
        <span>New post…</span>
        <span
          aria-hidden="true"
          className="grid h-10 w-10 place-items-center rounded-full bg-gold-400 text-maroon-900"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        // A click on the dialog element itself (not on the card inside it) is a click on the
        // dimmed backdrop.
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        aria-label="New post"
        className="fade-modal m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border-0 bg-transparent p-0 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop:bg-maroon-900/50"
      >
        <form
          onSubmit={handleSubmit}
          className="relative rounded-3xl border border-line bg-surface px-5 pt-5 pb-5"
        >
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-gold-tint hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <p className="mb-3 text-lg font-bold text-ink">New post</p>
          <input
            ref={titleBox}
            aria-label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            placeholder="Title"
            disabled={busy}
            className="field mb-3 font-bold disabled:opacity-60"
          />
          <textarea
            aria-label="Details"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_POST_LENGTH}
            rows={4}
            placeholder="Details (optional)"
            disabled={busy}
            className="field disabled:opacity-60"
          />
          {text.length >= COUNTER_FROM && (
            <p className="mt-1 text-right text-sm text-ink/60">
              {text.length} / {MAX_POST_LENGTH}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              aria-pressed={hasRsvp}
              onClick={() => setHasRsvp((on) => !on)}
              disabled={busy}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                hasRsvp
                  ? "border-gold-400 bg-gold-400 text-maroon-900"
                  : "border-line text-ink/70 hover:bg-gold-tint"
              }`}
            >
              Ask for RSVP
            </button>
            <button
              type="submit"
              disabled={busy || title.trim().length === 0}
              className="btn-main px-8"
            >
              {busy ? "Posting…" : "Post"}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
        </form>
      </dialog>
    </>
  );
}
