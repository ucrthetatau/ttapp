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

// The one place that holds the push state. PushProvider runs it once and shares the result,
// so the menu switch and the sign-in banner can never disagree about whether it is on.
export function usePushController() {
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

  // Flips the switch. Resolves true when it went through without an error (even if the member
  // said No to the prompt), false when something failed, so the caller can keep its message up.
  async function toggle(): Promise<boolean> {
    if (!email || state === "busy") return false;
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
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Try again.",
      );
      setState(wasOn ? "on" : "off");
      return false;
    }
  }

  return { state, error, toggle };
}

export type PushController = ReturnType<typeof usePushController>;
