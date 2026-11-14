import { useCallback, useState } from "react";
import { Outlet } from "react-router";
import { useAuth } from "../auth/auth.ts";
import { canManageMembers } from "../members/access.ts";
import { forgetThisDevice } from "../push/push.ts";
import PushBanner from "../push/PushBanner.tsx";
import PushProvider from "../push/PushProvider.tsx";
import { LinkIcon, MenuIcon, UsersIcon } from "./icons.tsx";
import SideMenu from "./SideMenu.tsx";
import type { MenuItem } from "./SideMenu.tsx";
import TabBar from "./TabBar.tsx";

// The frame around every screen that needs a signed-in member: the current screen, a small
// floating menu button in the top-left corner, the tab bar along the bottom, and the side
// menu (which also holds Sign out). There is no top bar: each page's title sits level with the
// menu button instead, so the screen starts higher up.
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
  // gets the menu, because the notifications switch and Sign out live at the bottom of it.
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
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          // Fixed, so the menu is always one tap away. 44px is a comfortable thumb target;
          // left-4 lines it up with the page's own 16px side margin. z-20 keeps it under the
          // menu panel (z-30 and z-40) and the pop-ups.
          className="fixed top-3 left-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-gold-400 shadow-md transition active:scale-95 hover:shadow-lg"
        >
          <MenuIcon />
        </button>
        <PushBanner />
        <Outlet />
      </div>
      <TabBar />
      <SideMenu
        open={menuOpen}
        onClose={closeMenu}
        items={menuItems}
        onSignOut={() => void handleSignOut()}
        signingOut={signingOut}
        signOutFailed={failed}
      />
    </PushProvider>
  );
}
