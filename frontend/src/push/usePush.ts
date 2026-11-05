import { useEffect, useState } from "react";
import { useAuth } from "../auth/auth.ts";
import { disablePush, enablePush, pushSupport, syncPush } from "./push.ts";

// What the switch shows. "unsupported", "needs-install" and "blocked" are dead ends the
// member cannot fix by tapping, so the switch is disabled and a message says what to do.
export type PushState =
  | "checking"
  | "off"
  | "on"
  | "busy"
  | "unsupported"
  | "needs-install"
  | "blocked";

export function usePush() {
  const auth = useAuth();
  const email = auth.status === "signedIn" ? auth.me.email : null;
  const [state, setState] = useState<PushState>("checking");
  const [error, setError] = useState<string | null>(null);

  // On open: work out the true state. Also repairs a lost subscription (see syncPush).
  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    async function check(member: string) {
      const support = pushSupport();
      if (support !== "ok") {
        setState(support);
        return;
      }
      try {
        const next = await syncPush(member);
        if (!cancelled) setState(next);
      } catch {
        // Most likely the service worker is not ready yet (first visit, or the dev server).
        if (!cancelled) setState("unsupported");
      }
    }

    void check(email);
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function toggle() {
    if (!email || state === "busy") return;
    const wasOn = state === "on";
    setError(null);
    setState("busy");
    try {
      if (wasOn) {
        await disablePush();
        setState("off");
      } else {
        const result = await enablePush(email);
        setState(
          result === "on" ? "on" : result === "blocked" ? "blocked" : "off",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Try again.",
      );
      setState(wasOn ? "on" : "off");
    }
  }

  return { state, error, toggle };
}
