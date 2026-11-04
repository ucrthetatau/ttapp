import { useEffect, useRef, useState } from "react";
import { MoreIcon } from "../components/icons.tsx";

export type MenuAction = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

// The three-dots button on a post. Tapping it opens a small list of what you can do with the
// post. It closes when you pick something, tap anywhere else, or press Escape. The card
// decides which actions exist (from canEdit and canDelete), so this only draws them, and it
// draws nothing at all when there are none.
export default function PostMenu({
  actions,
  disabled,
}: {
  actions: MenuAction[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // pointerdown covers a mouse click and a finger tap alike.
    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-label="Post options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded p-1 text-ink/60 hover:bg-black/5 disabled:opacity-60"
      >
        <MoreIcon />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 min-w-32 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-md"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={`block w-full px-4 py-2 text-left text-sm hover:bg-black/5 ${
                action.danger ? "text-red-800" : "text-ink"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
