// The "doorbell": a tiny message telling every open feed page that the feed changed.
// It goes through Supabase Realtime. The message carries no post text, only the signal; each
// page then asks GET /api/posts as usual, so every permission check stays in our own backend.
//
// Two signals, so a page knows roughly what happened:
//   "new-post"      someone posted.
//   "post-changed"  someone edited or deleted a post.
// A page treats them alike: it compares the newest posts with what it is showing.
//
// The feed works without it (pages still refresh when opened or brought back), so ringing is
// best effort: it never throws, and it quietly does nothing when the settings are missing,
// which is what happens on a machine without the Supabase keys.

const FEED_TOPIC = "feed";
export type FeedEvent = "new-post" | "post-changed";
const TIMEOUT_MS = 3000;

export async function ringFeed(event: FeedEvent): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ topic: FEED_TOPIC, event, payload: {} }],
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
