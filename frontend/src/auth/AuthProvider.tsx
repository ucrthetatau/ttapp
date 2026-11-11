import type { MeResponse } from "@ttapp/shared";
import { DOORBELL } from "@ttapp/shared";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useCoalesced } from "../common/useCoalesced.ts";
import { useDoorbell } from "../common/useDoorbell.ts";
import { AuthContext } from "./auth.ts";
import type { AuthState } from "./auth.ts";

// While someone is signed in, listens for "a role or membership changed" and asks the backend
// who they are again, so a new role (or being removed) shows up without a reload. It is its own
// component because a hook can't be switched on and off: it only exists while signed in.
// Rings come once per change, and a bulk change rings many times, so they are collapsed into
// one re-read per couple of seconds.
const RE_READ_GAP_MS = 2000;

function MemberDoorbell({ onChange }: { onChange: () => void }) {
  const ring = useCoalesced(onChange, RE_READ_GAP_MS);
  useDoorbell(DOORBELL.members.topic, DOORBELL.members.events, ring);
  return null;
}

// Asks the backend who is signed in when the app loads (and again when the doorbell says roles
// changed), and shares the answer.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // quiet = a re-read while the app is open: the screen is never swapped for "Loading", a
  // network blip keeps the current state, and only a clear answer changes anything.
  const loadMe = useCallback(async (quiet: boolean) => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) {
        setState({ status: "signedOut" });
      } else if (res.ok) {
        setState({ status: "signedIn", me: (await res.json()) as MeResponse });
      } else if (!quiet) {
        setState({ status: "error" });
      }
    } catch {
      if (!quiet) setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    // Syncing with the backend on load; the state is only set after the fetch answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMe(false);
  }, [loadMe]);

  // Ends the session on the backend, then forgets the member here. If the request fails the
  // session is still alive, so the state is left alone rather than claiming to be signed out.
  async function signOut(): Promise<boolean> {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) return false;
    } catch {
      return false;
    }
    setState({ status: "signedOut" });
    return true;
  }

  return (
    <AuthContext value={{ ...state, signOut }}>
      {state.status === "signedIn" && (
        <MemberDoorbell onChange={() => void loadMe(true)} />
      )}
      {children}
    </AuthContext>
  );
}
