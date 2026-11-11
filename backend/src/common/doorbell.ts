// The "doorbell": a tiny message telling every open page that something changed. It goes
// through Supabase Realtime. The message carries no data, only the signal; each page then asks
// the backend as usual, so every permission check stays in our own backend.
//
// Five topics, so a page only hears what concerns it (names are in shared/src/doorbell.ts):
//   feed   someone posted, or edited or deleted a post.
//   votes  a vote opened, closed or was deleted, or the headcount or someone's right to vote
//          changed.
//   member-list  the Members page: any change to the member list.
//   links  a link was added or removed.
//   members  a role was granted or revoked, or a member was removed or erased. Every open app
//          listens, so it can re-read who it is signed in as.
//
// The pages work without it (they still refresh when opened or brought back), so ringing is
// best effort: it never throws, and it quietly does nothing when the settings are missing,
// which is what happens on a machine without the Supabase keys.
import { DOORBELL } from "@ttapp/shared";
import type {
  FeedEvent,
  LinksEvent,
  MemberListEvent,
  MembersEvent,
  VotesEvent,
} from "@ttapp/shared";

const TIMEOUT_MS = 3000;

async function ring(topic: string, event: string): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ topic, event, payload: {} }],
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

export const ringFeed = (event: FeedEvent) => ring(DOORBELL.feed.topic, event);
export const ringVotes = (event: VotesEvent) =>
  ring(DOORBELL.votes.topic, event);
export const ringMembers = (event: MembersEvent) =>
  ring(DOORBELL.members.topic, event);
export const ringLinks = (event: LinksEvent) =>
  ring(DOORBELL.links.topic, event);
export const ringMemberList = (event: MemberListEvent) =>
  ring(DOORBELL.memberList.topic, event);
