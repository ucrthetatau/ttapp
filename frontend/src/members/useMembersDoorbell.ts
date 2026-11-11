import { DOORBELL } from "@ttapp/shared";
import { useCoalesced } from "../common/useCoalesced.ts";
import { useDoorbell } from "../common/useDoorbell.ts";

// The Members page's doorbell: someone added, removed, changed roles or can-vote, or signed in
// for the first time (possibly on another officer's screen). The ring carries no data, so the
// page reloads the list through its normal route. Rings in a burst (a bulk add) collapse into
// one reload.
export function useMembersDoorbell(reload: () => void) {
  const ring = useCoalesced(reload, 1500);
  useDoorbell(DOORBELL.memberList.topic, DOORBELL.memberList.events, ring);
}
