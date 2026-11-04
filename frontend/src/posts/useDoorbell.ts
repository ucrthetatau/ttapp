import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

// One connection setup for the whole app, made the first time it is needed. It stays null
// when the settings are missing, and then the feed simply works without the doorbell.
let client: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
    string | undefined;
  // Supabase is only used for this doorbell, never to sign anyone in, so its own login
  // storage and token refreshing are switched off.
  client =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  return client;
}

// Listens on the public "feed" channel while the screen is open, and calls onFeedChange each
// time the backend rings (see backend/src/common/doorbell.ts): when a post is created
// ("new-post") and when one is edited or deleted ("post-changed"). The ring carries no post
// data, so the caller is expected to ask the backend what changed.
//
// It hangs up when the screen closes. If the connection drops and comes back, anything posted
// during the gap was missed, so it calls onNewPost once on reconnecting too.
export function useDoorbell(onFeedChange: () => void) {
  // Keeps the newest callback without reconnecting every time the screen re-renders.
  const latest = useRef(onFeedChange);
  useEffect(() => {
    latest.current = onFeedChange;
  });

  useEffect(() => {
    const supabase = getClient();
    if (!supabase) return;

    let connectedBefore = false;
    const channel = supabase
      .channel("feed")
      .on("broadcast", { event: "new-post" }, () => latest.current())
      .on("broadcast", { event: "post-changed" }, () => latest.current())
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (connectedBefore) latest.current();
        connectedBefore = true;
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
}
