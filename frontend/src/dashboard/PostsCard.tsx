import type { Post, PostsResponse } from "@ttapp/shared";
import { Link } from "react-router";
import { useCoalesced } from "../common/useCoalesced.ts";
import { timeAgo } from "../posts/time.ts";
import { useDoorbell } from "../posts/useDoorbell.ts";
import Avatar from "../components/Avatar.tsx";
import { useCard } from "./useCard.ts";

const SHOWN = 2;

// One post: avatar, author, how long ago, and the first two lines. The whole row is a link to
// the feed, so there is no separate "see all" link to hunt for.
function PostRow({ post }: { post: Post }) {
  return (
    <Link
      to="/posts"
      className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-gold-tint active:bg-gold-tint"
    >
      <Avatar name={post.authorName} />
      <span className="block min-w-0 flex-1">
        <span className="block text-sm text-ink/60">
          <span className="font-bold text-ink">{post.authorName}</span> ·{" "}
          {timeAgo(post.createdAt)}
        </span>
        {post.title ? (
          <>
            <span className="mt-0.5 line-clamp-1 font-bold break-words text-ink">
              {post.title}
            </span>
            {post.body && (
              <span className="line-clamp-1 break-words text-ink/70">
                {post.body.split("\n")[0]}
              </span>
            )}
          </>
        ) : (
          <span className="mt-0.5 line-clamp-2 break-words whitespace-pre-line text-ink">
            {post.body}
          </span>
        )}
      </span>
    </Link>
  );
}

// "Latest posts": the newest two, each cut short. It reloads by itself when the feed doorbell
// rings. The feed page and this card never hear the doorbell at the same time, because only
// one of those pages is open.
export default function PostsCard() {
  const { state, reload } = useCard<PostsResponse>("/api/posts");
  const onRing = useCoalesced(reload, 1500);
  useDoorbell((event) => {
    // An RSVP answer only moves counts, which this card does not show.
    if (event !== "rsvp-changed") onRing();
  });

  return (
    <section className="card" aria-label="Latest posts">
      <h2 className="mb-2 px-2 text-sm font-bold tracking-wide text-ink/60 uppercase">
        Latest posts
      </h2>
      {state.status === "loading" && (
        <p className="px-2 text-sm text-ink/60">Loading…</p>
      )}
      {state.status === "error" && (
        <p role="alert" className="px-2 text-sm text-red-300">
          Posts: {state.message}
        </p>
      )}
      {state.status === "loaded" && state.data.posts.length === 0 && (
        <p className="px-2 text-sm text-ink/70">No posts yet.</p>
      )}
      {state.status === "loaded" && (
        <div className="space-y-1">
          {state.data.posts.slice(0, SHOWN).map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
