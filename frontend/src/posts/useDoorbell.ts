import { DOORBELL } from "@ttapp/shared";
import { useDoorbell as useChannelDoorbell } from "../common/useDoorbell.ts";

// The feed's doorbell: calls onFeedChange when someone posts ("new-post"), when a post is
// edited or deleted ("post-changed"), and when an RSVP answer changes ("rsvp-changed"). It
// passes the name of the event, or none after a reconnect (anything may have changed). The
// ring carries no post data, so the caller is expected to ask the backend what changed. The
// listening itself is shared with the Votes page (common/useDoorbell.ts).
export function useDoorbell(onFeedChange: (event?: string) => void) {
  useChannelDoorbell(DOORBELL.feed.topic, DOORBELL.feed.events, onFeedChange);
}
