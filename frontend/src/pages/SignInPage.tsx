import type { SignInError } from "@ttapp/shared";
import { useSearchParams } from "react-router";
import "./SignInPage.css";

// One message per code the backend callback can send in /sign-in?error=<code>.
const errorMessages: Record<SignInError, string> = {
  cancelled: "Sign-in was cancelled.",
  failed: "Sign-in failed. Please try again.",
  not_member: "This email isn't on the member list. Ask an officer to add you.",
  server_error: "Something went wrong on our side. Try again in a few minutes.",
};

function isSignInError(code: string): code is SignInError {
  return Object.hasOwn(errorMessages, code);
}

// Shown when nobody is signed in. The button is a normal link, not fetch, because the
// browser has to leave the app, go to Google, and come back through the backend callback.
export default function SignInPage() {
  const [params] = useSearchParams();
  const code = params.get("error");
  // An unknown code (for example a hand-edited address) gets the generic failure message.
  const message =
    code === null
      ? null
      : isSignInError(code)
        ? errorMessages[code]
        : errorMessages.failed;

  // For "not on the list", the address that was tried, so an officer knows what to add. Only
  // shown with that error, and only as plain text.
  const triedEmail = code === "not_member" ? params.get("email") : null;

  return (
    <main className="sign-in">
      <div className="sign-in-card">
        <h1>Theta Tau Hub</h1>
        {message && (
          <p className="sign-in-error" role="alert">
            {message}
            {triedEmail && (
              <>
                {" "}
                You signed in as{" "}
                <strong className="break-all">{triedEmail}</strong>. If that is
                not the email the chapter has, try another account.
              </>
            )}
          </p>
        )}
        <p className="sign-in-intro">
          Sign in with the Google account your chapter has on file.
        </p>
        <a className="sign-in-button" href="/api/auth/google">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          Sign in with Google
        </a>
      </div>
    </main>
  );
}
