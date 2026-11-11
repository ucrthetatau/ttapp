import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { Response } from "express";
import type { MeResponse, SignInError } from "@ttapp/shared";
import { requireLogin } from "../../common/auth.ts";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  deleteSession,
  setSessionCookie,
} from "../../common/sessions.ts";
import { getGoogleClient, redeemCode } from "./google.ts";
import { ringMemberList } from "../../common/doorbell.ts";
import { findActiveMemberByEmail, recordFirstLogin } from "./members.ts";

// The state cookie only needs to live long enough to go to Google and come back.
export const STATE_COOKIE = "oauth_state";
const STATE_COOKIE_PATH = "/api/auth";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export const authRouter = Router();

// Sends the browser back to the sign-in screen, which shows a message for the error code.
// For "not_member" it also passes the address that was tried, so the screen can show it and an
// officer knows exactly what to add. It is the address this same person just chose at Google,
// shown only to them, and it is the same for "never added" and "removed".
function failSignIn(res: Response, error: SignInError, email?: string) {
  const tried = email ? `&email=${encodeURIComponent(email)}` : "";
  res.redirect(`/sign-in?error=${error}${tried}`);
}

// GET /api/auth/google: start sign-in. Remembers a random `state` in a short-lived cookie,
// then sends the browser to Google. The callback checks the cookie against what comes back.
authRouter.get("/google", (_req, res) => {
  // Built first so a missing setting fails before any cookie is set.
  const googleClient = getGoogleClient();

  const state = randomBytes(32).toString("base64url");
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // Lax: the browser still sends it when Google redirects back
    secure: process.env.NODE_ENV === "production", // localhost is plain http
    maxAge: STATE_MAX_AGE_MS,
    path: STATE_COOKIE_PATH,
  });

  const url = googleClient.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account", // always show the account picker
  });
  res.redirect(url);
});

// GET /api/auth/google/callback: Google sends the browser back here after sign-in.
// Confirms this browser started the login, redeems the code, and checks the member list.
// Then starts a session and sends the member into the app.
authRouter.get("/google/callback", async (req, res) => {
  const savedState = req.cookies[STATE_COOKIE];
  // One use only: the cookie is deleted whether or not the check passes.
  res.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH });

  const { state, code, error } = req.query;
  if (error) {
    // For example the member pressed Cancel on Google's page.
    failSignIn(res, "cancelled");
    return;
  }
  if (typeof state !== "string" || !savedState || state !== savedState) {
    failSignIn(res, "failed");
    return;
  }
  if (typeof code !== "string") {
    failSignIn(res, "failed");
    return;
  }

  let identity;
  try {
    identity = await redeemCode(code);
  } catch (err) {
    // Message only: the full error object can carry the request, including the client secret.
    console.error(
      "Google sign-in failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    failSignIn(res, "failed");
    return;
  }

  // The steps below use the database, so a database problem lands here, not in a raw 500 page.
  try {
    const member = await findActiveMemberByEmail(identity.email);
    if (!member) {
      // Same answer for "never added" and "removed", so it doesn't reveal which.
      failSignIn(res, "not_member", identity.email);
      return;
    }
    if (!member.firstLoginAt) {
      await recordFirstLogin(member.id, identity.name);
      void ringMemberList("list-changed"); // the Members page now shows their name
    }

    const { token, expiresAt } = await createSession(member.id);
    setSessionCookie(res, token, expiresAt);
    res.redirect("/"); // back into the app
  } catch (err) {
    console.error(
      "Sign-in failed after Google:",
      err instanceof Error ? err.message : "unknown error",
    );
    failSignIn(res, "server_error");
  }
});

// GET /api/auth/me: who is signed in? The session cookie is HttpOnly, so the frontend can't
// look at it and asks here instead. 401 (from requireLogin) means show the sign-in button.
authRouter.get("/me", requireLogin, (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  const body: MeResponse = {
    name: auth.member.name,
    email: auth.member.email,
    roles: auth.roles,
  };
  res.json(body);
});

// POST /api/auth/logout: ends this browser's session. Works even if the session already
// expired, so signing out never fails.
authRouter.post("/logout", async (req, res) => {
  const token: unknown = req.cookies[SESSION_COOKIE];
  if (typeof token === "string") {
    await deleteSession(token);
  }
  clearSessionCookie(res);
  res.status(204).end();
});
