import { useEffect, useState } from "react";
import { useAuth } from "../auth/auth.ts";
import { VOTING_ONLY } from "../features.ts";
import { bannerSeen, markBannerSeen } from "./push.ts";
import { usePush } from "./pushContext.ts";

// The one-time nudge after sign-in. Notifications only help if members turn them on, and a
// switch hidden in a menu will not be found, so this asks once, plainly, and says why.
//
// It never fires the browser's permission prompt by itself. The Turn on button is the tap
// that does (iPhone only allows the prompt straight after a tap, and a "No" to a surprise
// prompt sticks until the member digs through settings).
//
// "Once" means once the member acts on it (Turn on, Not now or Got it): then a flag is saved
// for them on this device and it never comes back. The menu switch stays for changing their
// mind. If turning on fails, the banner stays up with the error so they can try again.
export default function PushBanner() {
  const auth = useAuth();
  const { state, error, toggle } = usePush();
  const email = auth.status === "signedIn" ? auth.me.email : null;
  const [seen, setSeen] = useState(() => (email ? bannerSeen(email) : true));

  // Notifications are on, however that happened (this banner, the menu switch, an earlier
  // visit): the member knows about the feature, so the banner is done for good. The effect
  // only writes the flag; the check below reads it, so it also holds if they switch off later.
  useEffect(() => {
    if (email && state === "on") markBannerSeen(email);
  }, [email, state]);

  if (!email || seen || bannerSeen(email)) return null;

  // Only when there is something useful to say: it can be turned on right now, or (iPhone) the
  // app still has to be installed first. Already on, blocked and unsupported get nothing.
  const canTurnOn = state === "off" || state === "busy";
  const needsInstall = state === "needs-install";
  if (!canTurnOn && !needsInstall) return null;

  function finish() {
    if (!email) return;
    markBannerSeen(email);
    setSeen(true);
  }

  async function turnOn() {
    // A failure keeps the banner (with the error) instead of silently using up the one chance.
    if (await toggle()) finish();
  }

  return (
    <section
      aria-label="Turn on notifications"
      className="border-b-4 border-gold-400 bg-gold-tint px-4 py-4"
    >
      {needsInstall ? (
        <>
          <h2 className="text-lg font-bold text-maroon-700">
            Don't miss a vote on your iPhone
          </h2>
          <p className="mt-1 text-ink">
            Votes open without warning, and the chapter counts on everyone to
            answer. To be told the moment one opens, add this app to your Home
            Screen: tap Share, then Add to Home Screen, then open it from there
            and turn on Notifications in the menu.
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={finish}
              className="rounded bg-maroon-500 px-4 py-2 font-semibold text-gold-300 hover:bg-maroon-700"
            >
              Got it
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-lg font-bold text-maroon-700">
            Don't miss a vote
          </h2>
          <p className="mt-1 text-ink">
            Votes open without warning, and the chapter counts on everyone to
            answer. Turn on notifications to hear the moment a vote opens
            {VOTING_ONLY ? "" : " or a new post goes up"}, even when the app is
            closed. It takes one tap.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={turnOn}
              disabled={state === "busy"}
              className="rounded bg-maroon-500 px-4 py-2 font-semibold text-gold-300 hover:bg-maroon-700 disabled:opacity-60"
            >
              Turn on notifications
            </button>
            <button
              type="button"
              onClick={finish}
              disabled={state === "busy"}
              className="px-2 py-2 text-sm text-ink/70 underline disabled:opacity-60"
            >
              Not now
            </button>
          </div>
          <p className="mt-2 text-sm text-ink/70">
            You can change this any time in the menu.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
