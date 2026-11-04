import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

// One connection setup for the whole app, made the first time it is needed. It stays null
// when the settings are missing, and then pages simply work without the doorbell.
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

// Listens on one public channel while the screen is open, and calls onRing each time the
// backend rings one of the given events (see backend/src/common/doorbell.ts and the names in
// shared/src/doorbell.ts). The ring carries no data, so the caller is expected to ask the
// backend what changed.
//
// It hangs up when the screen closes. If the connection drops and comes back, a ring during the
// gap was missed, so it calls onRing once on reconnecting too.
export function useDoorbell(
  topic: string,
  events: readonly string[],
  onRing: () => void,
) {
  // Keeps the newest callback without reconnecting every time the screen re-renders.
  const latest = useRef(onRing);
  useEffect(() => {
    latest.current = onRing;
  });

  useEffect(() => {
    const supabase = getClient();
    if (!supabase) return;

    let connectedBefore = false;
    let channel = supabase.channel(topic);
    for (const event of events) {
      channel = channel.on("broadcast", { event }, () => latest.current());
    }
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      if (connectedBefore) latest.current();
      connectedBefore = true;
    });

    return () => {
      void supabase.removeChannel(channel);
    };
    // The topic and events are fixed for a screen, so this only runs once per screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);
}
