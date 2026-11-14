import ComposePost from "../posts/ComposePost.tsx";
import PostCard from "../posts/PostCard.tsx";
import { useDoorbell } from "../posts/useDoorbell.ts";
import { usePosts } from "../posts/usePosts.ts";

// How far from the top still counts as "at the top": about a thumb's width. Past this the
// member is reading, and the page must not move on its own.
const AT_TOP_PX = 40;

// /posts: the chapter feed. Everyone can read, post and RSVP. The backend decides which posts
// each person may delete (canDelete), so this page needs no role checks of its own.
export default function PostsPage() {
  const {
    state,
    reload,
    loadMore,
    checkForChanges,
    refreshCounts,
    replacePost,
    removePost,
  } = usePosts();

  // The backend rings when something changes. An RSVP answer only moves numbers, so those
  // update quietly in place. A new, edited or deleted post changes what is on the page, so:
  // at the top of the feed it is shown at once (nothing can jump under your thumb there),
  // and anywhere further down a banner waits for you to tap. No event (a reconnect) means a
  // ring may have been missed, so it checks everything.
  useDoorbell((event) => {
    if (event !== "rsvp-changed") {
      void checkForChanges(window.scrollY < AT_TOP_PX);
    }
    if (event === undefined || event === "rsvp-changed") void refreshCounts();
  });

  // The feed is never rearranged under your thumb while you read; you choose when to refresh.
  function showChanges() {
    reload();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto max-w-2xl pt-3">
      <h1 className="mb-4 flex min-h-11 items-center pl-14 text-[28px] font-bold text-ink">
        Posts
      </h1>

      <ComposePost onPosted={reload} />

      {state.status === "loaded" && state.pending && (
        <button
          type="button"
          onClick={showChanges}
          className="btn-main sticky top-2 z-10 mx-auto mb-3 block px-5 py-2.5 text-sm shadow-md"
        >
          {state.pending === "new"
            ? "New posts · tap to show"
            : "Posts changed · tap to refresh"}
        </button>
      )}

      {state.status === "loading" && <p>Loading posts…</p>}
      {state.status === "error" && <p role="alert">{state.message}</p>}
      {state.status === "loaded" && state.posts.length === 0 && (
        <p className="card text-ink/70">No posts yet.</p>
      )}
      {state.status === "loaded" && state.posts.length > 0 && (
        <>
          <ul className="space-y-3">
            {state.posts.map((post) => (
              <li key={post.id}>
                <PostCard
                  post={post}
                  onChanged={replacePost}
                  onDeleted={removePost}
                />
              </li>
            ))}
          </ul>
          {state.moreError && (
            <p role="alert" className="mt-3 text-sm text-red-800">
              {state.moreError}
            </p>
          )}
          {state.hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={state.loadingMore}
              className="btn-outline mt-4 w-full"
            >
              {state.loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}
    </main>
  );
}
