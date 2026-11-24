import type { Post } from "@ttapp/shared";
import { useEffect, useState } from "react";
import Avatar from "../components/Avatar.tsx";
import { LineSkeleton } from "../components/Skeleton.tsx";
import DetailsDialog from "../dashboard/DetailsDialog.tsx";
import { getViews } from "./api.ts";

// The names behind the photo row. Only mounted while the pop-up is open (DetailsDialog renders
// its children only then), so nothing is fetched for posts nobody taps.
function Names({ post }: { post: Post }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getViews(post.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setNames(result.names);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [post.id, post.seenCount]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-red-300">
        {error}
      </p>
    );
  }
  if (!names) return <LineSkeleton label="Loading" />;
  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto text-ink">
      {names.map((name, i) => (
        <li key={`${name}-${i}`}>{name}</li>
      ))}
    </ul>
  );
}

// "Seen by", Messenger style: a small row of the newest viewers' photos under the message, then
// "+N" for the rest. Tapping it lists everyone's names. Nothing shows until someone has seen it.
export default function SeenBy({ post }: { post: Post }) {
  const [open, setOpen] = useState(false);
  if (post.seenCount === 0) return null;
  const more = post.seenCount - post.seenBy.length;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Seen by ${post.seenCount}. Show names`}
        className="mt-1.5 ml-auto flex items-center gap-1 rounded-full py-0.5 pl-1 text-xs text-ink/70"
      >
        <span className="flex -space-x-1">
          {post.seenBy.map((viewer, i) => (
            // The ring in the page color separates overlapping photos.
            <span
              key={`${viewer.name}-${i}`}
              className="rounded-full ring-2 ring-page"
            >
              <Avatar name={viewer.name} picture={viewer.picture} size={22} />
            </span>
          ))}
        </span>
        {more > 0 && (
          <span className="font-semibold tabular-nums">+{more}</span>
        )}
      </button>
      <DetailsDialog open={open} title="Seen by" onClose={() => setOpen(false)}>
        <h2 className="mb-2 pr-10 font-bold text-ink">
          Seen by {post.seenCount}
        </h2>
        <Names post={post} />
      </DetailsDialog>
    </>
  );
}
