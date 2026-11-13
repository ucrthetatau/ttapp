import type { MyDuesResponse, MyRequirementsResponse } from "@ttapp/shared";
import type { ReactNode } from "react";
import { useCard } from "./useCard.ts";
import type { CardState } from "./useCard.ts";

// Whole dollars read cleaner ($50). When there are cents, always show both digits ($1,250.50,
// never $1,250.5).
function formatMoney(amount: number): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// One half of the tile: a big number with a small caption underneath, and optionally a badge
// or a link. Every half loads and fails on its own, so one problem never blanks the other.
function Stat({
  value,
  tone,
  caption,
  children,
}: {
  value: string;
  tone: "good" | "bad";
  caption: string;
  children?: ReactNode;
}) {
  const color = tone === "good" ? "text-green-700" : "text-red-800";
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center px-3 py-2 text-center">
      <p
        className={`text-4xl leading-tight font-extrabold break-words ${color}`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink/60">{caption}</p>
      {children}
    </div>
  );
}

// What a half shows while loading, when it fails, or when the member isn't on that sheet.
function Message({ children, bad }: { children: ReactNode; bad?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center px-3 py-2 text-center">
      <p
        role={bad ? "alert" : undefined}
        className={`text-sm ${bad ? "text-red-800" : "text-ink/60"}`}
      >
        {children}
      </p>
    </div>
  );
}

function Dues({ state }: { state: CardState<MyDuesResponse> }) {
  if (state.status === "loading") return <Message>Loading…</Message>;
  if (state.status === "error") {
    return <Message bad>Dues: {state.message}</Message>;
  }
  const data = state.data;
  if (!data.configured) return null;
  if (!data.found) {
    return (
      <Message>
        You aren’t on the dues sheet. If you should be, ask an officer.
      </Message>
    );
  }
  const owed = data.stillToPay;
  return (
    <Stat
      value={formatMoney(owed)}
      tone={owed > 0 ? "bad" : "good"}
      caption={owed > 0 ? "dues owed" : "paid up"}
    />
  );
}

function Requirements({ state }: { state: CardState<MyRequirementsResponse> }) {
  if (state.status === "loading") return <Message>Loading…</Message>;
  if (state.status === "error") {
    return <Message bad>Requirements: {state.message}</Message>;
  }
  const data = state.data;
  if (!data.configured) return null;
  if (!data.found) {
    return (
      <Message>
        You aren’t on the requirements sheet. If you should be, ask an officer.
      </Message>
    );
  }
  return (
    <Stat
      value={`${data.percent}%`}
      tone={data.onTrack ? "good" : "bad"}
      caption="requirements"
    >
      <span
        className={`badge mt-2 ${data.onTrack ? "!bg-green-100 !text-green-800" : "!bg-red-100 !text-red-800"}`}
      >
        {data.onTrack ? "On track" : `Below ${data.threshold}%`}
      </span>
      <a
        href={data.sheetUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 text-sm font-semibold text-maroon-500 underline"
      >
        See details
      </a>
    </Stat>
  );
}

const notSetUp = (state: CardState<{ configured: boolean }>) =>
  state.status === "loaded" && !state.data.configured;

// "My standing": one tile with two big numbers side by side, dues owed and the percentage of
// requirements met. A half that isn't set up is left out (the other one fills the tile), and
// the whole tile hides until officers have chosen at least one sheet.
export default function StandingCard() {
  const requirements = useCard<MyRequirementsResponse>(
    "/api/dashboard/me/requirements",
  );
  const dues = useCard<MyDuesResponse>("/api/dashboard/me/dues");

  const showDues = !notSetUp(dues.state);
  const showRequirements = !notSetUp(requirements.state);
  if (!showDues && !showRequirements) return null;

  return (
    <section
      aria-label="My standing"
      className="card flex items-stretch divide-x divide-line py-6"
    >
      {showDues && <Dues state={dues.state} />}
      {showRequirements && <Requirements state={requirements.state} />}
    </section>
  );
}
