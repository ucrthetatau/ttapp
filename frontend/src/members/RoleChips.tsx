import type { Role } from "@ttapp/shared";
import { useEffect, useRef, useState } from "react";
import { grantableRoles } from "./api.ts";
import type { GrantableRole } from "./api.ts";

const chip =
  "inline-flex items-center gap-1 rounded-full bg-gold-tint px-2.5 py-0.5 text-xs font-medium text-maroon-500 ring-1 ring-gold-400";

// A member's roles as chips. For an admin (editable) each granted role has a small x to take
// it away, and a "+ Role" menu lists the roles they don't have yet: click one to add it.
// "member" never has an x because everyone active is a member.
export default function RoleChips({
  roles,
  editable,
  busy,
  onGrant,
  onRevoke,
}: {
  roles: Role[];
  editable: boolean;
  busy: boolean;
  onGrant: (role: GrantableRole) => void;
  onRevoke: (role: GrantableRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLLIElement>(null);

  // While the menu is open, a click elsewhere or Escape closes it.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const available = grantableRoles.filter((role) => !roles.includes(role));

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {roles.map((role) => (
        <li key={role} className={chip}>
          {role}
          {editable && role !== "member" && (
            <button
              type="button"
              onClick={() => onRevoke(role as GrantableRole)}
              disabled={busy}
              aria-label={`Remove the ${role} role`}
              className="-mr-1 rounded-full px-1 leading-none hover:bg-maroon-500 hover:text-gold-300 disabled:opacity-60"
            >
              ×
            </button>
          )}
        </li>
      ))}
      {editable && available.length > 0 && (
        <li ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={open}
            className="rounded-full border border-dashed border-maroon-500 px-2.5 py-0.5 text-xs font-medium text-maroon-500 hover:bg-gold-tint disabled:opacity-60"
          >
            + Role
          </button>
          {open && (
            <ul
              role="menu"
              className="absolute right-0 z-10 mt-1 w-32 rounded-xl border border-line bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
            >
              {available.map((role) => (
                <li key={role} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onGrant(role);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gold-tint"
                  >
                    {role}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </li>
      )}
    </ul>
  );
}
