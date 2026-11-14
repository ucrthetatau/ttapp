import type { MyDuesResponse, MyRequirementsResponse } from "@ttapp/shared";
import type { ReactNode } from "react";
import DetailsDialog from "./DetailsDialog.tsx";
import { formatMoney, formatNumber } from "./format.ts";
import type { CardState } from "./useCard.ts";

function SheetLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="btn-main mt-5 block text-center"
    >
      {label}
    </a>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0">
      <dt className="text-ink/60">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}

// What the pop-up says when there is no number: the problem, in the words the backend chose.
function Problem({ children }: { children: ReactNode }) {
  return <p className="text-ink/70">{children}</p>;
}

export function DuesDialog({
  open,
  onClose,
  state,
}: {
  open: boolean;
  onClose: () => void;
  state: CardState<MyDuesResponse>;
}) {
  let body: ReactNode = null;
  if (state.status === "error") {
    body = <Problem>{state.message}</Problem>;
  } else if (state.status === "loaded" && state.data.configured) {
    const data = state.data;
    if (!data.found) {
      body = (
        <>
          <Problem>
            You aren’t on the dues sheet. If you should be, ask an officer.
          </Problem>
          <SheetLink href={data.sheetUrl} label="Open dues sheet" />
        </>
      );
    } else {
      const owed = data.stillToPay;
      body = (
        <>
          <p
            className={`text-4xl font-extrabold ${owed > 0 ? "text-red-800" : "text-green-700"}`}
          >
            {formatMoney(owed)}
          </p>
          <p className="mb-3 text-sm font-semibold text-ink/60">
            {owed > 0 ? "still to pay" : "paid up"}
          </p>
          <dl>
            <Row label="Status" value={data.status || "—"} />
            <Row label="Charged" value={formatMoney(data.charged)} />
            <Row label="Paid" value={formatMoney(data.paid)} />
          </dl>
          <SheetLink href={data.sheetUrl} label="Open dues sheet" />
        </>
      );
    }
  }
  return (
    <DetailsDialog open={open} title="Dues" onClose={onClose}>
      {body}
    </DetailsDialog>
  );
}

export function RequirementsDialog({
  open,
  onClose,
  state,
}: {
  open: boolean;
  onClose: () => void;
  state: CardState<MyRequirementsResponse>;
}) {
  let body: ReactNode = null;
  if (state.status === "error") {
    body = <Problem>{state.message}</Problem>;
  } else if (state.status === "loaded" && state.data.configured) {
    const data = state.data;
    if (!data.found) {
      body = (
        <>
          <Problem>
            You aren’t on the requirements sheet. If you should be, ask an
            officer.
          </Problem>
          <SheetLink href={data.sheetUrl} label="Open requirements sheet" />
        </>
      );
    } else {
      const percent = Math.max(0, Math.min(100, data.percent));
      const short = data.threshold - data.percent;
      body = (
        <>
          <p
            className={`text-4xl font-extrabold ${data.onTrack ? "text-green-700" : "text-red-800"}`}
          >
            {formatNumber(data.percent)}%
          </p>
          <p className="mb-3 text-sm font-semibold text-ink/60">
            of requirements met
          </p>
          {/* The bar, with a tick where the cut-off is. */}
          <div
            className="relative h-3 rounded-full bg-line"
            role="img"
            aria-label={`${formatNumber(data.percent)} percent, ${data.threshold} percent needed`}
          >
            <div
              className={`h-full rounded-full ${data.onTrack ? "bg-green-600" : "bg-red-600"}`}
              style={{ width: `${percent}%` }}
            />
            <div
              className="absolute -top-1 h-5 w-0.5 bg-ink"
              style={{ left: `${data.threshold}%` }}
            />
          </div>
          <p className="mt-3 text-ink">
            {data.onTrack
              ? `On track. You need ${data.threshold}%.`
              : `You need ${data.threshold}%. You’re ${formatNumber(short)} point${short === 1 ? "" : "s"} short.`}
          </p>
          <SheetLink href={data.sheetUrl} label="Open requirements sheet" />
        </>
      );
    }
  }
  return (
    <DetailsDialog open={open} title="Requirements" onClose={onClose}>
      {body}
    </DetailsDialog>
  );
}
