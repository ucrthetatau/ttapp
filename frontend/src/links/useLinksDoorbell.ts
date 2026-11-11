import { DOORBELL } from "@ttapp/shared";
import { useCoalesced } from "../common/useCoalesced.ts";
import { useDoorbell } from "../common/useDoorbell.ts";

// The Links page's doorbell: a link was added or removed. The page reloads the list.
export function useLinksDoorbell(reload: () => void) {
  const ring = useCoalesced(reload, 1500);
  useDoorbell(DOORBELL.links.topic, DOORBELL.links.events, ring);
}
