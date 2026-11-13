import type { DashboardEvent, DashboardEventsResponse } from "@ttapp/shared";
import { useState } from "react";
import { useCard } from "./useCard.ts";

// "Fri, Dec 5 · 7:00 PM", or just "Mon, Dec 1" for an all-day event. An all-day event arrives
// as a plain date, which must be read as that day here, not as midnight in another timezone.
function formatWhen(event: DashboardEvent): string {
  if (event.allDay) {
    const [year, month, day] = event.start.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  const start = new Date(event.start);
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

function EventBody({ event }: { event: DashboardEvent }) {
  return (
    <>
      <span className="badge">{event.calendar}</span>
      <span className="mt-2 block text-lg font-bold text-ink">
        {event.title}
      </span>
      <span className="mt-0.5 block text-sm text-ink/70">
        {formatWhen(event)}
      </span>
      {event.location && (
        <span className="mt-0.5 block text-sm text-ink/60">
          {event.location}
        </span>
      )}
    </>
  );
}

// "Upcoming events": the next event in front, and the one after it peeking out from behind
// like the next card in a stack. Tapping the stack brings the second one forward.
export default function EventsCard() {
  const { state } = useCard<DashboardEventsResponse>("/api/dashboard/events");
  const [flipped, setFlipped] = useState(false);

  if (state.status === "loading") {
    return (
      <section className="card" aria-label="Upcoming events">
        <h2 className="badge">Upcoming</h2>
        <p className="mt-2 text-sm text-ink/60">Loading…</p>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="card" aria-label="Upcoming events">
        <h2 className="badge">Upcoming</h2>
        <p role="alert" className="mt-2 text-sm text-red-800">
          Events: {state.message}
        </p>
      </section>
    );
  }

  const { events, failed } = state.data;
  const note = failed.length > 0 && (
    <p className="mt-2 text-xs text-ink/60">
      Couldn’t load: {failed.join(", ")}
    </p>
  );

  if (events.length === 0) {
    return (
      <section className="card" aria-label="Upcoming events">
        <h2 className="badge">Upcoming</h2>
        <p className="mt-2 text-sm text-ink/70">No upcoming events.</p>
        {note}
      </section>
    );
  }

  const hasSecond = events.length > 1;
  const front = events[hasSecond && flipped ? 1 : 0];
  const back = hasSecond ? events[flipped ? 0 : 1] : null;

  return (
    <section aria-label="Upcoming events">
      <div className={`relative ${back ? "pb-7" : ""}`}>
        {back && (
          // The second event, mostly hidden: only its bottom strip shows below the front card.
          <div
            aria-hidden="true"
            className="absolute inset-x-3 bottom-0 h-14 rounded-2xl border border-line bg-gold-tint px-4 pt-8 text-xs text-ink/60"
          >
            <span className="block truncate">
              Then: {back.title} · {formatWhen(back)}
            </span>
          </div>
        )}
        {back ? (
          <button
            type="button"
            onClick={() => setFlipped((current) => !current)}
            aria-label="Show the other event"
            className="card relative block w-full text-left"
          >
            <EventBody event={front} />
          </button>
        ) : (
          <div className="card">
            <EventBody event={front} />
          </div>
        )}
      </div>
      {note}
    </section>
  );
}
