import type { Post, PostRsvpsResponse } from "@ttapp/shared";
import { useEffect, useState } from "react";
import { getRsvps } from "./api.ts";

type WhoState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; rsvps: PostRsvpsResponse };

// The names behind the Yes and No counts. It is only mounted while the "Who?" panel is open,
// so nothing is fetched for posts nobody expands. It asks again whenever the counts or your
// own answer change, so the names never disagree with the buttons above them.
export default function WhoList({ post }: { post: Post }) {
  const [state, setState] = useState<WhoState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getRsvps(post.id).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "loaded", rsvps: result.rsvps }
          : { status: "error", message: result.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [post.id, post.yesCount, post.noCount, post.myAnswer]);

  if (state.status === "loading") {
    return <p className="mt-2 text-sm text-ink/60">Loading…</p>;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="mt-2 text-sm text-red-800">
        {state.message}
      </p>
    );
  }

  const groups = [
    { label: "Yes", names: state.rsvps.yes },
    { label: "No", names: state.rsvps.no },
  ];
  return (
    <div className="mt-2 space-y-1 text-sm">
      {groups.map(({ label, names }) => (
        <p key={label}>
          <span className="font-medium text-ink">
            {label} ({names.length}):
          </span>{" "}
          <span className="text-ink/70">
            {names.length === 0 ? "No one yet" : names.join(", ")}
          </span>
        </p>
      ))}
    </div>
  );
}
