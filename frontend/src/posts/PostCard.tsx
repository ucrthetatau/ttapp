import type { Post } from "@ttapp/shared";
import { useState } from "react";
import { deletePost, setRsvp } from "./api.ts";
import { linkify } from "./linkify.tsx";
import { timeAgo } from "./time.ts";
import WhoList from "./WhoList.tsx";

// The post as it will look once the backend has accepted your answer. Taking back an answer
// (null) and changing it both come down to "remove my old answer, add the new one".
function withAnswer(post: Post, answer: boolean | null): Post {
  return {
    ...post,
    myAnswer: answer,
    yesCount:
      post.yesCount -
      (post.myAnswer === true ? 1 : 0) +
      (answer === true ? 1 : 0),
    noCount:
      post.noCount -
      (post.myAnswer === false ? 1 : 0) +
      (answer === false ? 1 : 0),
  };
}

function AnswerButton({
  label,
  count,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded border px-4 py-1 text-sm font-medium disabled:opacity-60 ${
        selected
          ? "border-maroon-700 bg-maroon-700 text-gold-300"
          : "border-line bg-white text-ink hover:bg-black/5"
      }`}
    >
      {label} · {count}
    </button>
  );
}

// One post in the feed. It sends its own RSVP and delete requests. When the backend accepts
// one, it tells the page what changed (onChanged / onDeleted) so only this post is updated.
// Whether Delete shows at all is decided by the backend (canDelete); the backend also
// refuses a delete that isn't allowed, so hiding the button is only a courtesy.
export default function PostCard({
  post,
  onChanged,
  onDeleted,
}: {
  post: Post;
  onChanged: (post: Post) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWho, setShowWho] = useState(false);

  // Tapping the answer you already gave takes it back.
  async function handleAnswer(answer: boolean) {
    const next = post.myAnswer === answer ? null : answer;
    setBusy(true);
    setError(null);
    const result = await setRsvp(post.id, next);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onChanged(withAnswer(post, next));
  }

  async function handleDelete() {
    if (!window.confirm("Delete this post? This can't be undone here.")) return;
    setBusy(true);
    setError(null);
    const result = await deletePost(post.id);
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }
    onDeleted(post.id);
  }

  return (
    <article className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{post.authorName}</p>
          <p
            className="text-xs text-ink/60"
            title={new Date(post.createdAt).toLocaleString()}
          >
            {timeAgo(post.createdAt)}
          </p>
        </div>
        {post.canDelete && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={busy}
            className="shrink-0 rounded border border-line px-3 py-1 text-sm text-red-800 hover:bg-red-50 disabled:opacity-60"
          >
            Delete
          </button>
        )}
      </div>

      <p className="mt-2 whitespace-pre-wrap wrap-break-word text-ink">
        {linkify(post.body)}
      </p>

      {post.hasRsvp && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <AnswerButton
              label="Yes"
              count={post.yesCount}
              selected={post.myAnswer === true}
              disabled={busy}
              onClick={() => void handleAnswer(true)}
            />
            <AnswerButton
              label="No"
              count={post.noCount}
              selected={post.myAnswer === false}
              disabled={busy}
              onClick={() => void handleAnswer(false)}
            />
            <button
              type="button"
              onClick={() => setShowWho((open) => !open)}
              aria-expanded={showWho}
              className="text-sm text-ink/60 underline-offset-2 hover:underline"
            >
              {showWho ? "Hide who" : "Who?"}
            </button>
          </div>
          {post.myAnswer !== null && (
            <p className="mt-1 text-xs text-ink/60">
              Tap your answer again to take it back.
            </p>
          )}
          {showWho && <WhoList post={post} />}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </article>
  );
}
