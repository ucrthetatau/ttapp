import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/auth.ts";
import { bannerSeen, markBannerSeen } from "./push.ts";
import { usePush } from "./pushContext.ts";

// The one-time nudge after sign-in, shown as a pop-up over the screen. Notifications only help
// if members turn them on, and a switch hidden in a menu will not be found, so this asks once,
// plainly, and says why. A pop-up is used so it cannot be scrolled past.
//
// It never fires the browser's permission prompt by itself. The Allow notifications button is the tap
// that does (iPhone only allows the prompt straight after a tap, and a "No" to a surprise
// prompt sticks until the member digs through settings).
//
// "Once" means once the member acts on it (Allow notifications, Not now, Got it, or closing it with
// Escape): then a flag is saved for them on this device and it never comes back. The menu
// switch stays for changing their mind. If turning on fails, the pop-up stays with the error
// so they can try again.
export default function PushBanner() {
  const auth = useAuth();
  const { state, error, toggle } = usePush();
  const email = auth.status === "signedIn" ? auth.me.email : null;
  const [seen, setSeen] = useState(() => (email ? bannerSeen(email) : true));
  const dialog = useRef<HTMLDialogElement>(null);

  // Notifications are on, however that happened (this pop-up, the menu switch, an earlier
  // visit): the member knows about the feature, so it is done for good. The effect only writes
  // the flag; the check below reads it, so it also holds if they switch off later.
  useEffect(() => {
    if (email && state === "on") markBannerSeen(email);
  }, [email, state]);

  // Only when there is something useful to say: it can be turned on right now, or (iPhone) the
  // app still has to be installed first. Already on, blocked and unsupported get nothing.
  const canTurnOn = state === "off" || state === "busy";
  const needsInstall = state === "needs-install";
  const visible =
    email !== null &&
    !seen &&
    !bannerSeen(email) &&
    (canTurnOn || needsInstall);

  // The browser's own <dialog> gives the dimmed backdrop and keeps focus inside it.
  useEffect(() => {
    const el = dialog.current;
    if (visible && el && !el.open) el.showModal();
  }, [visible]);

  if (!visible) return null;

  function finish() {
    if (!email) return;
    markBannerSeen(email);
    setSeen(true);
    dialog.current?.close();
  }

  async function turnOn() {
    // A failure keeps the pop-up (with the error) instead of silently using up the one chance.
    if (await toggle()) finish();
  }

  return (
    <dialog
      ref={dialog}
      onClose={finish}
      aria-labelledby="push-banner-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border-0 p-0 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop:bg-maroon-900/50"
    >
      <div className="rounded-3xl bg-gold-tint p-6 text-center">
        <h2
          id="push-banner-title"
          className="text-2xl font-bold text-maroon-900"
        >
          {needsInstall ? "Turn on notifications" : "Allow notifications"}
        </h2>
        {needsInstall ? (
          <>
            <p className="mt-2 text-ink">
              You need them for votes, requirements and dues. On iPhone, tap
              Share, then Add to Home Screen, open the app from there, and turn
              them on in the menu.
            </p>
            <button
              type="button"
              onClick={finish}
              className="btn-main mt-5 w-full"
            >
              Got it
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-ink">
              You need them for votes, requirements and dues. Tap the button,
              then tap Allow when your phone asks.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={turnOn}
                disabled={state === "busy"}
                className="btn-main w-full"
              >
                Allow notifications
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={state === "busy"}
                className="px-4 py-2 text-sm font-semibold text-ink/70"
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
