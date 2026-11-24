import { useEffect } from "react";
import type { RefObject } from "react";
import { markSeen } from "./api.ts";

// An announcement counts as seen when at least half of it (or, for a very tall one, half the
// screen) has been on screen for this long with the app in front. The wait is what keeps a fast
// scroll from marking everything it flies past.
const VISIBLE_FRACTION = 0.5;
const DWELL_MS = 1000;
// Seen posts are collected for a moment and sent together: scrolling past ten posts is one
// request, not ten.
const SEND_AFTER_MS = 1500;

// What this phone already told the server since the page was opened. The server would ignore a
// repeat anyway (one row per member per post); this just saves the request.
const reported = new Set<string>();
const queue = new Set<string>();
let sendTimer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  sendTimer = undefined;
  const postIds = [...queue];
  queue.clear();
  if (postIds.length === 0) return;
  // Fire and forget: a failure only means the view is reported next time it is on screen.
  void markSeen(postIds).then((result) => {
    if (!result.ok) for (const id of postIds) reported.delete(id);
  });
}

function report(postId: string) {
  if (reported.has(postId)) return;
  reported.add(postId);
  queue.add(postId);
  sendTimer ??= setTimeout(flush, SEND_AFTER_MS);
}

// Put on a post's element: reports the post once it has really been looked at.
export function useReportSeen(
  element: RefObject<HTMLElement | null>,
  postId: string,
) {
  useEffect(() => {
    const el = element.current;
    if (!el || reported.has(postId)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onScreen = false;

    function stop() {
      clearTimeout(timer);
      timer = undefined;
    }
    function start() {
      if (timer !== undefined || reported.has(postId)) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (onScreen && document.visibilityState === "visible") {
          report(postId);
          observer.disconnect();
        }
      }, DWELL_MS);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // A post taller than the screen can never be half visible, so half the screen counts too.
        onScreen =
          entry.isIntersecting &&
          (entry.intersectionRatio >= VISIBLE_FRACTION ||
            entry.intersectionRect.height >=
              window.innerHeight * VISIBLE_FRACTION);
        if (onScreen) start();
        else stop();
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    observer.observe(el);

    // Leaving the app (or locking the phone) with a post on screen is not looking at it.
    function onVisibility() {
      if (document.visibilityState === "visible") {
        if (onScreen) start();
      } else {
        stop();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [element, postId]);
}
