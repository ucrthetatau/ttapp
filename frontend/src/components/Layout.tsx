import { useCallback, useState } from "react";
import { Link, Outlet } from "react-router";
import { useAuth } from "../auth/auth.ts";
import { canManageMembers } from "../members/access.ts";
import { forgetThisDevice } from "../push/push.ts";
import PushBanner from "../push/PushBanner.tsx";
import PushProvider from "../push/PushProvider.tsx";
import { LinkIcon, MenuIcon, UsersIcon } from "./icons.tsx";
import SideMenu from "./SideMenu.tsx";
import type { MenuItem } from "./SideMenu.tsx";
import TabBar from "./TabBar.tsx";

// The frame around every screen that needs a signed-in member: a header (menu button, title,
// sign out), the current screen, the tab bar along the bottom, and the side menu.
export default function Layout() {
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  async function handleSignOut() {
    setSigningOut(true);
    setFailed(false);
    // First, while the session still works: stop notifications on this device, so a signed-out
    // phone does not keep buzzing about chapter business. It never blocks the sign-out.
    await forgetThisDevice();
    const ok = await auth.signOut();
    // On success the app redirects to /sign-in, so only a failure needs the button back.
    if (!ok) {
      setFailed(true);
      setSigningOut(false);
    }
  }

  // The links in the side menu. Only officers and admins have any for now; everyone still
  // gets the menu, because the notifications switch lives at the bottom of it.
  const menuItems: MenuItem[] = [];
  if (auth.status === "signedIn" && canManageMembers(auth.me.roles)) {
    menuItems.push({ to: "/admin/members", label: "Admin", Icon: UsersIcon });
    menuItems.push({
      to: "/admin/dashboard",
      label: "Dashboard setup",
      Icon: LinkIcon,
    });
  }

  return (
    <PushProvider>
      {/* The bottom padding keeps the end of every screen clear of the tab bar. */}
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <header className="flex flex-wrap items-center gap-3 bg-maroon-700 px-4 py-3 text-gold-300 shadow-sm">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-full p-1.5 hover:bg-maroon-500"
          >
            <MenuIcon />
          </button>
          <Link to="/" className="font-bold text-gold-300">
            Theta Tau Hub
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="ml-auto rounded-full border border-gold-400 px-4 py-1.5 text-sm font-semibold hover:bg-maroon-500 disabled:opacity-60"
          >
            Sign out
          </button>
          {failed && (
            <p role="alert" className="basis-full text-sm">
              Couldn't sign out. Try again.
            </p>
          )}
        </header>
        <PushBanner />
        <Outlet />
      </div>
      <TabBar />
      <SideMenu open={menuOpen} onClose={closeMenu} items={menuItems} />
    </PushProvider>
  );
}
