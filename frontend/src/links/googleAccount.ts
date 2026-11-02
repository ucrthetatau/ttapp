// Whether a link points at Google (docs.google.com, drive.google.com, ...). Only those can be
// opened through Google's account picker.
export function isGoogleLink(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "google.com" || host.endsWith(".google.com");
  } catch {
    return false;
  }
}

// Google's account picker, then on to the link. Lets someone whose default Google account has
// no access to the file choose another one. Long-standing but not an official, documented
// address, so the plain link is always the main action.
export function accountChooserUrl(url: string): string {
  return `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(url)}`;
}
