// Talking to Google as the chapter's service account: a robot account that only has the
// access officers gave it (Viewer on the sheets, "See all event details" on the calendars).
// The key is a server setting, GOOGLE_SERVICE_ACCOUNT_JSON; it is never stored in the
// database, logged, or sent to the browser.
import { GoogleAuth } from "google-auth-library";

const TIMEOUT_MS = 8000;
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

// What a dashboard route answers when Google can't be used. The message is safe to show.
export class GoogleError extends Error {
  // "not_set_up": no key on this server. "no_access": Google said the account may not read
  // it (not shared, or wrong ID). "failed": Google is down or answered something odd.
  constructor(
    message: string,
    readonly reason: "not_set_up" | "no_access" | "failed",
  ) {
    super(message);
  }
}

type ServiceAccountKey = { client_email: string; private_key: string };

let loaded: { key: ServiceAccountKey; auth: GoogleAuth } | null | undefined;

// Read on first use so teammates without the key can still run the rest of the backend.
function load() {
  if (loaded !== undefined) return loaded;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    loaded = null;
    return loaded;
  }
  try {
    const key = JSON.parse(raw) as ServiceAccountKey;
    if (!key.client_email || !key.private_key) throw new Error("incomplete");
    loaded = {
      key,
      auth: new GoogleAuth({ credentials: key, scopes: SCOPES }),
    };
  } catch {
    // Never print the value. A bad setting acts like a missing one.
    console.error("GOOGLE_SERVICE_ACCOUNT_JSON is set but is not a valid key");
    loaded = null;
  }
  return loaded;
}

/** The address officers share sheets and calendars with, or null if no key is set. */
export function serviceAccountEmail(): string | null {
  return load()?.key.client_email ?? null;
}

/** GET a Google API address and return its JSON. Throws GoogleError. */
export async function googleGet(url: string): Promise<unknown> {
  const account = load();
  if (!account) {
    throw new GoogleError(
      "Google isn't set up on the server yet",
      "not_set_up",
    );
  }
  let res: Response;
  try {
    const token = await account.auth.getAccessToken();
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error(
      "Google request failed:",
      error instanceof Error ? error.name : "unknown",
    );
    throw new GoogleError("Couldn't reach Google", "failed");
  }
  if (res.status === 403 || res.status === 404) {
    throw new GoogleError(
      "Google says this account can't open it. Share it with the address shown above, or check the link",
      "no_access",
    );
  }
  if (!res.ok) {
    console.error(`Google answered ${res.status}`);
    throw new GoogleError("Google had a problem. Try again", "failed");
  }
  return res.json();
}

// A short cache so fifty members opening the app in one minute make one request to Google,
// not fifty. Several callers at once share the same pending request, and a failure is not
// remembered. A change in a sheet can take up to TTL to show.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

// Called after an officer saves or removes a source, so the dashboard shows the change now.
export function clearGoogleCache() {
  cache.clear();
}
