import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useAuth } from "./auth/auth.ts";
import type { AuthState } from "./auth/auth.ts";
import Layout from "./components/Layout.tsx";
import HomePage from "./pages/HomePage.tsx";
import { VOTING_ONLY } from "./features.ts";
import LinksPage from "./pages/LinksPage.tsx";
import DashboardSetupPage from "./pages/DashboardSetupPage.tsx";
import MembersPage from "./pages/MembersPage.tsx";
import PostsPage from "./pages/PostsPage.tsx";
import SignInPage from "./pages/SignInPage.tsx";
import VotesPage from "./pages/VotesPage.tsx";

// While we don't know yet, or the backend is unreachable, no screen should guess.
function waitingScreen(auth: AuthState): ReactNode {
  if (auth.status === "loading") return <p>Loading…</p>;
  if (auth.status === "error") {
    return <p>Can't reach the server. Try again in a moment.</p>;
  }
  return null;
}

// Wraps a screen that needs a signed-in member. Signed-out visitors go to /sign-in.
function RequireSignIn({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const waiting = waitingScreen(auth);
  if (waiting) return waiting;
  if (auth.status === "signedOut") return <Navigate to="/sign-in" replace />;
  return children;
}

// The sign-in screen is for signed-out visitors only. Someone already signed in goes home.
function SignedOutOnly({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const waiting = waitingScreen(auth);
  if (waiting) return waiting;
  if (auth.status === "signedIn") return <Navigate to="/" replace />;
  return children;
}

// Each screen gets a route here. Feature screens (dashboard) get added as they're built.
export default function App() {
  return (
    <Routes>
      <Route
        element={
          <RequireSignIn>
            <Layout />
          </RequireSignIn>
        }
      >
        {VOTING_ONLY ? (
          <>
            {/* Only voting is shown: the other screens lead to Votes. */}
            <Route path="/" element={<Navigate to="/votes" replace />} />
            <Route path="/posts" element={<Navigate to="/votes" replace />} />
            <Route path="/links" element={<Navigate to="/votes" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<HomePage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/links" element={<LinksPage />} />
          </>
        )}
        <Route path="/votes" element={<VotesPage />} />
        <Route path="/admin/members" element={<MembersPage />} />
        <Route path="/admin/dashboard" element={<DashboardSetupPage />} />
      </Route>
      <Route
        path="/sign-in"
        element={
          <SignedOutOnly>
            <SignInPage />
          </SignedOutOnly>
        }
      />
    </Routes>
  );
}
