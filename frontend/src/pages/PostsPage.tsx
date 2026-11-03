import ComposePost from "../posts/ComposePost.tsx";
import PostCard from "../posts/PostCard.tsx";
import { usePosts } from "../posts/usePosts.ts";

// /posts: the chapter feed. Everyone can read, post and RSVP. The backend decides which posts
// each person may delete (canDelete), so this page needs no role checks of its own.
export default function PostsPage() {
  const { state, reload, loadMore, replacePost, removePost } = usePosts();

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold text-maroon-500">Posts</h1>

      <ComposePost onPosted={reload} />

      {state.status === "loading" && <p>Loading posts…</p>}
      {state.status === "error" && <p role="alert">{state.message}</p>}
      {state.status === "loaded" && state.posts.length === 0 && (
        <p>No posts yet. Write the first one above.</p>
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
              className="mt-4 w-full rounded border border-line bg-white px-4 py-2 font-medium text-maroon-500 hover:bg-black/5 disabled:opacity-60"
            >
              {state.loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}
    </main>
  );
}
