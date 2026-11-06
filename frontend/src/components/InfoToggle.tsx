import { useState } from "react";
import type { ReactNode } from "react";

// A small round "i" button that drops a note down when tapped. The button is placed in the
// top-right corner of the nearest `relative` parent (a card), so every info button in the app
// sits in the same spot. The note itself shows where this component is placed in the layout,
// so put it where the dropdown should open.
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
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        className={`absolute ${corner} grid h-7 w-7 place-items-center rounded-full border border-maroon-500 text-sm leading-none font-bold text-maroon-500 ${
          tone === "warning" ? "bg-gold-400" : "bg-white hover:bg-gold-tint"
        }`}
      >
        i
      </button>
      {open && (
        <div className="mt-3 space-y-1 rounded-xl border border-line bg-gold-tint px-3 py-2 text-sm text-ink/80">
          {children}
        </div>
      )}
    </>
  );
}
