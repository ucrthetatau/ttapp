import { VOTING_ONLY } from "../features.ts";
import { usePush } from "./pushContext.ts";
import type { PushState } from "./usePush.ts";

// What to tell the member under the switch. The dead-end states say what to do about it.
const HINTS: Record<PushState, string> = {
  checking: "",
  busy: "",
  off: VOTING_ONLY
    ? "Get a message the moment a vote opens, even when the app is closed."
    : "Get a message when a vote opens or someone posts, even when the app is closed.",
  on: VOTING_ONLY
    ? "You'll get a message the moment a vote opens."
    : "You'll get a message when a vote opens or someone posts.",
  blocked:
    "Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.",
  unsupported: "This browser can't receive notifications.",
  "needs-install":
    "On iPhone, add the app to your Home Screen first (Share, then Add to Home Screen), then open it from there.",
};

// The on/off switch for notifications on this device. It sits in the side menu.
export default function NotificationSwitch() {
  const { state, error, toggle } = usePush();
  const on = state === "on";
  const enabled = state === "on" || state === "off";

  return (
    <div className="mt-auto border-t border-gold-tint px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span id="push-label" className="font-medium text-ink">
          Notifications
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="push-label"
          disabled={!enabled}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            on ? "bg-maroon-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              on ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {HINTS[state] && (
        <p className="mt-1 text-sm text-ink/70">{HINTS[state]}</p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
