import type { PostsResponse } from "@ttapp/shared";
import { Link } from "react-router";
import { useCoalesced } from "../common/useCoalesced.ts";
import { timeAgo } from "../posts/time.ts";
import { useDoorbell } from "../posts/useDoorbell.ts";
import { useCard } from "./useCard.ts";

const SHOWN = 2;

// "Latest posts": the newest two, each cut short, with a link to the whole feed. It reloads
// by itself when the feed doorbell rings. The feed page and this card never hear the doorbell
// at the same time, because only one of those pages is open.
export default function PostsCard() {
  const { state, reload } = useCard<PostsResponse>("/api/posts");
  const onRing = useCoalesced(reload, 1500);
  useDoorbell((event) => {
    // An RSVP answer only moves counts, which this card does not show.
    if (event !== "rsvp-changed") onRing();
  });

  return (
    <section className="card space-y-3" aria-label="Latest posts">
      <h2 className="badge">Latest posts</h2>
      {state.status === "loading" && (
        <p className="text-sm text-ink/60">Loading…</p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-800">
          Posts: {state.message}
        </p>
      )}
      {state.status === "loaded" && state.data.posts.length === 0 && (
        <p className="text-sm text-ink/70">No posts yet.</p>
      )}
      {state.status === "loaded" &&
        state.data.posts.slice(0, SHOWN).map((post) => (
          <div
            key={post.id}
            className="border-b border-line pb-3 last:border-0 last:pb-0"
          >
            <p className="text-sm text-ink/60">
              <span className="font-semibold text-ink">{post.authorName}</span>{" "}
              · {timeAgo(post.createdAt)}
            </p>
            <p className="mt-1 line-clamp-3 break-words whitespace-pre-line text-ink">
              {post.body}
            </p>
          </div>
        ))}
      <Link
        to="/posts"
        className="inline-block text-sm font-semibold text-maroon-500 underline"
      >
        See all posts
      </Link>
    </section>
  );
}
