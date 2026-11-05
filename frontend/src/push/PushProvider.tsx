import type { ReactNode } from "react";
import { PushContext } from "./pushContext.ts";
import { usePushController } from "./usePush.ts";

// Runs the push state once and shares it with everything below (the menu switch and the
// sign-in banner). Without this each would run its own copy: two checks on every open, and
// turning it on in the banner would leave the switch showing "off" until a reload.
export default function PushProvider({ children }: { children: ReactNode }) {
  const push = usePushController();
  return <PushContext value={push}>{children}</PushContext>;
}
