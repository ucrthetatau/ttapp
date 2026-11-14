import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// A small round "i" button that opens a mini window right under it when tapped. The window
// floats over the page (it does not push the card's content down), is lined up with the button's
// right edge, and closes when you tap anywhere else or press Escape. The button is placed in
// the top-right corner of the nearest `relative` parent (a card), so every info button in the
// app sits in the same spot. `corner` moves it when a card has its own spacing.
//
// `tone="warning"` fills the button gold so a note that needs attention is noticed.
export default function InfoToggle({
  children,
  label = "More info",
  tone = "plain",
  corner = "top-4 right-4",
}: {
  children: ReactNode;
  label?: string;
  tone?: "plain" | "warning";
  corner?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span
      ref={box}
      className={`absolute ${corner} ${open ? "z-[15]" : "z-10"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        className={`grid h-7 w-7 place-items-center rounded-full border border-gold-400 text-sm leading-none font-bold text-gold-400 ${
          tone === "warning" ? "bg-gold-400" : "bg-surface hover:bg-gold-tint"
        }`}
      >
        i
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-3rem)] space-y-1 rounded-xl border border-line bg-gold-tint px-3 py-2 text-left text-sm font-normal text-ink/80 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          {children}
        </div>
      )}
    </span>
  );
}
