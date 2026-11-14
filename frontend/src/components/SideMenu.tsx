import { useEffect, useRef } from "react";
import type { ComponentType } from "react";
import { NavLink } from "react-router";
import NotificationSwitch from "../push/NotificationSwitch.tsx";
import { CloseIcon } from "./icons.tsx";

export type MenuItem = {
  to: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

// The panel that slides in from the left when the three-line button is pressed. A tap on the
// dark area, the X, Escape, or any link inside closes it. While closed it is "inert", so it
// can't be tabbed to or read out by a screen reader. Every member has this menu: the links
// are whatever their roles allow (maybe none), and the notifications switch and Sign out are at
// the bottom.
export default function SideMenu({
  open,
  onClose,
  items,
  onSignOut,
  signingOut,
  signOutFailed,
}: {
  open: boolean;
  onClose: () => void;
  items: MenuItem[];
  onSignOut: () => void;
  signingOut: boolean;
  signOutFailed: boolean;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <nav
        aria-label="Menu"
        inert={!open}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col rounded-r-3xl bg-white transition-transform duration-200 ${
          open ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between rounded-tr-3xl bg-maroon-700 px-4 py-3 text-gold-300">
          <span className="font-bold">Menu</span>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-full p-1.5 hover:bg-maroon-500"
          >
            <CloseIcon />
          </button>
        </div>
        <ul className="space-y-1 p-3">
          {items.map(({ to, label, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-full px-4 py-3 font-semibold ${
                    isActive
                      ? "bg-gold-tint text-maroon-500"
                      : "text-ink hover:bg-gold-tint"
                  }`
                }
              >
                <Icon />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <NotificationSwitch />
        {/* Last, out of the way: a tap here ends the session on this device. */}
        <div className="border-t border-gold-tint p-3">
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="btn-outline w-full"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          {signOutFailed && (
            <p role="alert" className="mt-2 text-center text-sm text-red-700">
              Couldn’t sign out. Try again.
            </p>
          )}
        </div>
      </nav>
    </>
  );
}
