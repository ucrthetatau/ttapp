import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// The pop-up that puts an open vote in front of a member who still has to answer. Everything
// behind it fades out, so the vote is the one thing on the screen. It uses the browser's own
// <dialog>, which dims the page, traps focus and closes on Escape.
//
// "Decide later" closes it without answering; the vote stays on the page with its Yes and No
// buttons. The page decides when it is open: it opens by itself for a vote the member has not
// answered, and answering closes it.
export default function VoteModal({
  open,
  onDismiss,
  children,
}: {
  open: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onClose={onDismiss}
      aria-label="Vote now"
      className="fade-modal m-auto w-[calc(100%-2rem)] max-w-md overflow-visible bg-transparent p-0 backdrop:bg-black/70"
    >
      {open && (
        <>
          {children}
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="mt-3 w-full py-2 text-sm font-semibold text-white/80"
          >
            Decide later
          </button>
        </>
      )}
    </dialog>
  );
}
