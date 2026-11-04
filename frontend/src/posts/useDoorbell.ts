import { DOORBELL } from "@ttapp/shared";
import { useDoorbell as useChannelDoorbell } from "../common/useDoorbell.ts";

// The feed's doorbell: calls onFeedChange when someone posts ("new-post") and when a post is
// edited or deleted ("post-changed"). The ring carries no post data, so the caller is expected
// to ask the backend what changed. The listening itself is shared with the Votes page
// (common/useDoorbell.ts).
export function useDoorbell(onFeedChange: () => void) {
  useChannelDoorbell(DOORBELL.feed.topic, DOORBELL.feed.events, onFeedChange);
}
