import { OAuth2Client } from "google-auth-library";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy backend/.env.example to backend/.env and fill it in.`,
    );
  }
  return value;
}

// Built on first use, not at startup, so teammates without the Google secret can still
// run the backend for work that has nothing to do with login.
let client: OAuth2Client | undefined;

export function getGoogleClient(): OAuth2Client {
  client ??= new OAuth2Client({
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: requireEnv("GOOGLE_REDIRECT_URI"),
  });
  return client;
}

export type GoogleIdentity = {
  email: string;
  name: string | undefined;
  /** The link to their Google profile photo, if Google sent one (checked before it is stored). */
  picture: string | undefined;
};

// Trades the one-time code for who just signed in. Throws if Google rejects the code,
// the token wasn't issued for this app, or the email is missing or unverified.
export async function redeemCode(code: string): Promise<GoogleIdentity> {
  const googleClient = getGoogleClient();
  const { tokens } = await googleClient.getToken(code);
  if (!tokens.id_token) {
    throw new Error("Google did not return an ID token");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token,
    // Without an audience the library skips this check, so always pass it.
    audience: requireEnv("GOOGLE_CLIENT_ID"),
  });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified) {
    throw new Error("Google email is missing or not verified");
  }

  // Members are stored with normalized emails, so match the same way.
  return {
    email: payload.email.trim().toLowerCase(),
    name: payload.name,
    picture: payload.picture,
  };
}
