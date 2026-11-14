import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// A details pop-up in the same style as the notification pop-up: the browser's own <dialog>,
// which dims the page, keeps focus inside, and closes on Escape. Tapping the dimmed area
// outside the card closes it too.
export default function DetailsDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Start with focus on the card itself, not on the close button (which would show a
      // focus ring the moment the pop-up opens). Tab still reaches the buttons.
      card.current?.focus({ preventScroll: true });
    }
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      // A click on the dialog element itself (not on the card inside it) is a click on the
      // dimmed backdrop.
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
      aria-label={title}
      className="fade-modal m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border-0 bg-transparent p-0 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop:bg-maroon-900/50"
    >
      {open && (
        <div
          ref={card}
          tabIndex={-1}
          className="relative rounded-3xl border border-line bg-surface px-6 pt-5 pb-6 outline-none"
        >
          {/* No visible title: the number and its label right below already say what this is.
              The dialog's aria-label still names it for screen readers. The close button sits
              in the corner, so the content starts at the top instead of under its own row. */}
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-gold-tint hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          {children}
        </div>
      )}
    </dialog>
  );
}
