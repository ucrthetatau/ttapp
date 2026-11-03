import type { Post, PostsResponse } from "@ttapp/shared";
import { useCallback, useEffect, useState } from "react";

export type PostsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      posts: Post[];
      hasMore: boolean; // older posts exist on the server
      loadingMore: boolean;
      moreError: string | null;
    };

async function fetchPage(
  before?: string,
): Promise<{ ok: true; page: PostsResponse } | { ok: false; message: string }> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  try {
    const res = await fetch(`/api/posts${query}`);
    if (!res.ok) return { ok: false, message: "Couldn't load the posts." };
    return { ok: true, page: (await res.json()) as PostsResponse };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

// Holds the feed the screen shows. The server hands out 20 posts at a time, newest first, so
// this keeps what has been loaded so far:
//   reload()   asks for the newest 20 again (on open, after posting, when the app comes back).
//   loadMore() asks for the 20 older than the oldest one on screen and adds them to the end.
// Reacting to one post (an RSVP, a delete) changes just that post in the list, so the rest of
// the feed doesn't jump back to the top.
export function usePosts() {
  const [state, setState] = useState<PostsState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchPage();
      if (cancelled) return;
      setState((prev) => {
        if (!result.ok) {
          // A refresh that fails leaves the feed you were reading alone.
          return prev.status === "loaded"
            ? prev
            : { status: "error", message: result.message };
        }
        const fresh = result.page.posts;
        // Older pages already on screen stay, so a refresh doesn't throw away your place.
        const oldestFresh = fresh[fresh.length - 1];
        const kept =
          prev.status === "loaded" && oldestFresh
            ? prev.posts.filter((p) => p.createdAt < oldestFresh.createdAt)
            : [];
        return {
          status: "loaded",
          posts: [...fresh, ...kept],
          hasMore:
            kept.length > 0 && prev.status === "loaded"
              ? prev.hasMore
              : result.page.hasMore,
          loadingMore: false,
          moreError: null,
        };
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  // Coming back to the app (switching apps, or tapping a notification) shows the latest.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") reload();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (state.status !== "loaded" || state.loadingMore || !state.hasMore) {
      return;
    }
    const last = state.posts[state.posts.length - 1];
    if (!last) return;
    setState({ ...state, loadingMore: true, moreError: null });

    const result = await fetchPage(last.createdAt);
    setState((prev) => {
      if (prev.status !== "loaded") return prev;
      // If the feed was reloaded while this was loading, the end of the list is different
      // and this page no longer fits. Drop it.
      if (prev.posts[prev.posts.length - 1]?.id !== last.id) return prev;
      if (!result.ok) {
        return { ...prev, loadingMore: false, moreError: result.message };
      }
      const known = new Set(prev.posts.map((p) => p.id));
      return {
        ...prev,
        posts: [
          ...prev.posts,
          ...result.page.posts.filter((p) => !known.has(p.id)),
        ],
        hasMore: result.page.hasMore,
        loadingMore: false,
        moreError: null,
      };
    });
  }, [state]);

  const replacePost = useCallback((updated: Post) => {
    setState((prev) =>
      prev.status === "loaded"
        ? {
            ...prev,
            posts: prev.posts.map((p) => (p.id === updated.id ? updated : p)),
          }
        : prev,
    );
  }, []);

  const removePost = useCallback((id: string) => {
    setState((prev) =>
      prev.status === "loaded"
        ? { ...prev, posts: prev.posts.filter((p) => p.id !== id) }
        : prev,
    );
  }, []);

  return { state, reload, loadMore, replacePost, removePost };
}
