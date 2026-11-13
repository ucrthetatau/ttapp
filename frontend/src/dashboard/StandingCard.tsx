import type { MyDuesResponse, MyRequirementsResponse } from "@ttapp/shared";
import { useCard } from "./useCard.ts";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  // Whole dollars read cleaner ($50), but keep the cents when there are some ($50.25).
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function Requirements({ data }: { data: MyRequirementsResponse }) {
  if (!data.configured) return null;
  if (!data.found) {
    return (
      <p className="text-sm text-ink/70">
        No requirements row found for you. Ask an officer.
      </p>
    );
  }
  const percent = Math.max(0, Math.min(100, data.percent));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-3xl font-extrabold text-ink">
          {data.percent}%
          <span className="ml-2 text-sm font-semibold text-ink/60">
            requirements
          </span>
        </p>
        <span
          className={`badge ${data.onTrack ? "!bg-green-100 !text-green-800" : "!bg-red-100 !text-red-800"}`}
        >
          {data.onTrack ? "On track" : `Below ${data.threshold}%`}
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={`${data.percent} percent of requirements done`}
      >
        <div
          className={`h-full rounded-full ${data.onTrack ? "bg-green-600" : "bg-red-600"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <a
        href={data.sheetUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-sm font-semibold text-maroon-500 underline"
      >
        See details
      </a>
    </div>
  );
}

function Dues({ data }: { data: MyDuesResponse }) {
  if (!data.configured) return null;
  if (!data.found) {
    return (
      <p className="text-sm text-ink/70">
        No dues row found for you. Ask an officer.
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-ink">
        <span className="font-semibold">Dues:</span> {data.status || "—"}
      </p>
      <p
        className={`font-bold ${data.stillToPay > 0 ? "text-red-800" : "text-green-800"}`}
      >
        {data.stillToPay > 0
          ? `${money.format(data.stillToPay)} to pay`
          : "Paid up"}
      </p>
    </div>
  );
}

// "My standing": how the member is doing on requirements and dues. Each half loads and fails
// on its own. The card hides itself when neither sheet has been set up, so the dashboard
// does not show an empty box before officers have chosen their sheets.
export default function StandingCard() {
  const requirements = useCard<MyRequirementsResponse>(
    "/api/dashboard/me/requirements",
  );
  const dues = useCard<MyDuesResponse>("/api/dashboard/me/dues");

  const notSetUp = (state: {
    status: string;
    data?: { configured: boolean };
  }) => state.status === "loaded" && state.data?.configured === false;
  if (notSetUp(requirements.state) && notSetUp(dues.state)) return null;

  return (
    <section className="card space-y-4" aria-label="My standing">
      <h2 className="badge">My standing</h2>
      {requirements.state.status === "loading" && (
        <p className="text-sm text-ink/60">Loading…</p>
      )}
      {requirements.state.status === "error" && (
        <p role="alert" className="text-sm text-red-800">
          Requirements: {requirements.state.message}
        </p>
      )}
      {requirements.state.status === "loaded" && (
        <Requirements data={requirements.state.data} />
      )}
      {dues.state.status === "loaded" && dues.state.data.configured && (
        <hr className="border-line" />
      )}
      {dues.state.status === "error" && (
        <p role="alert" className="text-sm text-red-800">
          Dues: {dues.state.message}
        </p>
      )}
      {dues.state.status === "loaded" && <Dues data={dues.state.data} />}
    </section>
  );
}
