import type { MyDuesResponse, MyRequirementsResponse } from "@ttapp/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { formatMoney } from "./format.ts";
import { DuesDialog, RequirementsDialog } from "./StandingDialogs.tsx";
import { useCard } from "./useCard.ts";
import type { CardState } from "./useCard.ts";

// A small arrow in the corner: the only hint, with no words, that the number can be tapped.
function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="absolute top-3 right-3 text-ink/30"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// One raised button holding a big number, its label, and a small colored status line. It
// opens the details pop-up. Spans, not divs, because a button may only hold inline content.
function StatButton({
  value,
  tone,
  label,
  status,
  bar,
  onOpen,
}: {
  value: string;
  tone: "good" | "bad";
  label: string;
  status: string;
  /** 0 to 100: draws a gold progress bar under the status. */
  bar?: number;
  onOpen: () => void;
}) {
  const color = tone === "good" ? "text-green-300" : "text-red-300";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${value}, ${status}. Show details`}
      className="relative flex min-w-0 flex-1 flex-col items-center rounded-2xl border border-line bg-surface px-3 py-4 text-center shadow-soft transition active:scale-[0.98] hover:border-gold-400"
    >
      <Chevron />
      <span className="block text-4xl leading-tight font-extrabold break-words text-gold-400">
        {value}
      </span>
      <span className="mt-1 block text-sm font-semibold text-ink/60">
        {label}
      </span>
      <span className={`block text-xs font-bold tracking-wide ${color}`}>
        {status}
      </span>
      {bar !== undefined && (
        <span className="mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-ink/20">
          <span
            className="block h-full rounded-full bg-gold-400"
            style={{ width: `${bar}%` }}
          />
        </span>
      )}
    </button>
  );
}

// What a half shows while loading, when it fails, or when the member isn't on that sheet. The
// last two still open the pop-up, which says the same thing in full and links to the sheet.
function MessageButton({
  children,
  bad,
  onOpen,
}: {
  children: ReactNode;
  bad?: boolean;
  onOpen?: () => void;
}) {
  const classes =
    "relative flex min-w-0 flex-1 items-center justify-center rounded-2xl border border-line bg-surface px-3 py-4 text-center text-sm";
  const tone = bad ? "text-red-300" : "text-ink/60";
  if (!onOpen) {
    return <div className={`${classes} ${tone}`}>{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${classes} ${tone} shadow-soft transition active:scale-[0.98] hover:shadow-md`}
    >
      <Chevron />
      <span className="block">{children}</span>
    </button>
  );
}

function Dues({
  state,
  onOpen,
}: {
  state: CardState<MyDuesResponse>;
  onOpen: () => void;
}) {
  if (state.status === "loading")
    return <MessageButton>Loading…</MessageButton>;
  if (state.status === "error") {
    return (
      <MessageButton bad onOpen={onOpen}>
        Dues: {state.message}
      </MessageButton>
    );
  }
  const data = state.data;
  if (!data.configured) return null;
  if (!data.found) {
    return (
      <MessageButton onOpen={onOpen}>
        You aren’t on the dues sheet. If you should be, ask an officer.
      </MessageButton>
    );
  }
  const owed = data.stillToPay;
  return (
    <StatButton
      value={formatMoney(owed)}
      tone={owed > 0 ? "bad" : "good"}
      label="dues"
      status={owed > 0 ? "OWED" : "PAID UP"}
      onOpen={onOpen}
    />
  );
}

function Requirements({
  state,
  onOpen,
}: {
  state: CardState<MyRequirementsResponse>;
  onOpen: () => void;
}) {
  if (state.status === "loading")
    return <MessageButton>Loading…</MessageButton>;
  if (state.status === "error") {
    return (
      <MessageButton bad onOpen={onOpen}>
        Requirements: {state.message}
      </MessageButton>
    );
  }
  const data = state.data;
  if (!data.configured) return null;
  if (!data.found) {
    return (
      <MessageButton onOpen={onOpen}>
        You aren’t on the requirements sheet. If you should be, ask an officer.
      </MessageButton>
    );
  }
  return (
    <StatButton
      value={`${data.percent}%`}
      tone={data.onTrack ? "good" : "bad"}
      label="requirements"
      status={data.onTrack ? "ON TRACK" : `BELOW ${data.threshold}%`}
      bar={Math.max(0, Math.min(100, data.percent))}
      onOpen={onOpen}
    />
  );
}

const notSetUp = (state: CardState<{ configured: boolean }>) =>
  state.status === "loaded" && !state.data.configured;

// "My standing": one tile holding two raised buttons, dues owed and the percentage of
// requirements met. Each opens its own details pop-up. A half that isn't set up is left out
// (the other one fills the tile), and the whole tile hides until officers have chosen at least
// one sheet.
export default function StandingCard() {
  const requirements = useCard<MyRequirementsResponse>(
    "/api/dashboard/me/requirements",
  );
  const dues = useCard<MyDuesResponse>("/api/dashboard/me/dues");
  const [open, setOpen] = useState<"dues" | "requirements" | null>(null);

  const showDues = !notSetUp(dues.state);
  const showRequirements = !notSetUp(requirements.state);
  if (!showDues && !showRequirements) return null;

  return (
    <>
      <section
        aria-label="My standing"
        className="flex items-stretch gap-3 rounded-3xl bg-black/20 p-2.5"
      >
        {showDues && <Dues state={dues.state} onOpen={() => setOpen("dues")} />}
        {showRequirements && (
          <Requirements
            state={requirements.state}
            onOpen={() => setOpen("requirements")}
          />
        )}
      </section>
      <DuesDialog
        open={open === "dues"}
        onClose={() => setOpen(null)}
        state={dues.state}
      />
      <RequirementsDialog
        open={open === "requirements"}
        onClose={() => setOpen(null)}
        state={requirements.state}
      />
    </>
  );
}
