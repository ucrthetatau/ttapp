// The Google profile photo address we keep for a member. It comes from Google's sign-in token,
// never from the member or the browser, and we keep only the link (never the image itself).
//
// It is shown to other members as an <img src>, so it must be a plain https address on Google's
// own picture host and nothing else. That way no sign-in, and no future bug, can ever put an
// arbitrary address into other people's screens. The database repeats the same rule as a check on
// the column, so a mistake here still cannot store anything else.

const MAX_LENGTH = 2000;
const HOST_SUFFIX = ".googleusercontent.com";

/** The address if it is a safe Google photo link, otherwise null (the member then shows initials). */
export function safePictureUrl(raw: string | undefined | null): string | null {
  if (!raw || raw.length > MAX_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  // "https://lh3.googleusercontent.com@evil.com/" has the host evil.com; credentials in an
  // address are never legitimate here.
  if (url.username !== "" || url.password !== "") return null;
  // A real photo host is a subdomain such as lh3.googleusercontent.com. The leading dot also
  // rejects look-alikes such as evilgoogleusercontent.com.
  if (!url.hostname.endsWith(HOST_SUFFIX)) return null;
  if (url.hostname.length <= HOST_SUFFIX.length) return null;
  return raw;
}
