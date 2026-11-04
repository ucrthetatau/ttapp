// The "doorbell": a tiny message telling every open feed page that something new was posted.
// It goes through Supabase Realtime. The message carries no post text, only the signal; each
// page then asks GET /api/posts as usual, so every permission check stays in our own backend.
//
// The feed works without it (pages still refresh when opened or brought back), so ringing is
// best effort: it never throws, and it quietly does nothing when the settings are missing,
// which is what happens on a machine without the Supabase keys.

const FEED_TOPIC = "feed";
const NEW_POST_EVENT = "new-post";
const TIMEOUT_MS = 3000;

export async function ringFeed(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ topic: FEED_TOPIC, event: NEW_POST_EVENT, payload: {} }],
      }),
      // A slow or stuck Supabase must not tie up the server.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`Doorbell: Supabase answered ${res.status}`);
    }
  } catch (error) {
    console.error("Doorbell: could not ring", error);
  }
}
