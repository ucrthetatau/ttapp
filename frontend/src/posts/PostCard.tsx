import type { Post } from "@ttapp/shared";
import { useState } from "react";
import Avatar from "../components/Avatar.tsx";
import { deletePost, setRsvp } from "./api.ts";
import EditPostForm from "./EditPostForm.tsx";
import { linkify } from "./linkify.tsx";
import PostMenu from "./PostMenu.tsx";
import type { MenuAction } from "./PostMenu.tsx";
import { timeOfDay } from "./time.ts";
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

// A pill: gold for Going, cream for Can't go. Outlined until it is your answer, then filled.
function AnswerButton({
  label,
  count,
  tone,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  tone: "going" | "cant";
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const look =
    tone === "going"
      ? selected
        ? "border-gold-400 bg-gold-400 text-maroon-900"
        : "border-gold-400 text-gold-400 hover:bg-gold-tint"
      : selected
        ? "border-ink bg-ink text-maroon-900"
        : "border-ink text-ink hover:bg-gold-tint";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-full border px-5 py-1.5 text-sm font-bold transition-colors disabled:opacity-60 ${look}`}
    >
      {label} · {count}
    </button>
  );
}

// One post in the feed. It sends its own RSVP and delete requests (the editor sends edits).
// When the backend accepts one, it tells the page what changed (onChanged / onDeleted) so
// only this post is updated. Whether Edit and Delete show at all is decided by the backend
// (canEdit, canDelete); the backend also refuses anything not allowed, so hiding a button is
// only a courtesy.
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
  const [editing, setEditing] = useState(false);

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

  // What the three-dots menu offers. Edit is left out while you are already editing.
  const actions: MenuAction[] = [];
  if (post.canEdit && !editing) {
    actions.push({ label: "Edit", onSelect: () => setEditing(true) });
  }
  if (post.canDelete) {
    actions.push({
      label: "Delete",
      onSelect: () => void handleDelete(),
      danger: true,
    });
  }

  return (
    <article className="flex items-start gap-3">
      <Avatar name={post.authorName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate">
            <span className="font-bold text-gold-400">{post.authorName}</span>{" "}
            <span
              className="text-xs text-ink/50"
              title={new Date(post.createdAt).toLocaleString()}
            >
              · {timeOfDay(post.createdAt)}
              {post.editedAt && (
                <span
                  title={`Edited ${new Date(post.editedAt).toLocaleString()}`}
                >
                  {" "}
                  (edited)
                </span>
              )}
            </span>
          </p>
          <PostMenu actions={actions} disabled={busy} />
        </div>

        {/* The message itself, as a chat bubble: one square corner where the avatar is. */}
        <div className="mt-1 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 shadow-soft">
          {editing ? (
            <EditPostForm
              post={post}
              onSaved={(saved) => {
                onChanged(saved);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              {post.title && (
                <p className="font-bold wrap-break-word text-ink">
                  {post.title}
                </p>
              )}
              {post.body && (
                <p
                  className={`whitespace-pre-wrap wrap-break-word text-ink ${post.title ? "mt-1" : ""}`}
                >
                  {linkify(post.body)}
                </p>
              )}
            </>
          )}

          {post.hasRsvp && (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <AnswerButton
                  label="Going"
                  tone="going"
                  count={post.yesCount}
                  selected={post.myAnswer === true}
                  disabled={busy}
                  onClick={() => void handleAnswer(true)}
                />
                <AnswerButton
                  label="Can’t go"
                  tone="cant"
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
                <p className="mt-1 text-xs text-ink/60">Tap again to undo.</p>
              )}
              {showWho && <WhoList post={post} />}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
