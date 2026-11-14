import type { DashboardEvent, DashboardEventsResponse } from "@ttapp/shared";
import { useState } from "react";
import { useCard } from "./useCard.ts";
import { useNow } from "./useNow.ts";

const DAY_MS = 86_400_000;

// An all-day event arrives as a plain date (2026-12-01), which must be read as that day here,
// not as midnight in another timezone. A timed event arrives as a full timestamp.
function startOf(event: DashboardEvent): Date {
  if (event.allDay) {
    const [year, month, day] = event.start.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(event.start);
}

function endOf(event: DashboardEvent): Date {
  if (event.allDay) {
    const [year, month, day] = event.end.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(event.end);
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const timeOf = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// "Today", "Tomorrow", a weekday for the coming week, then a short date.
function dayWord(date: Date, now: Date): string {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// "Today · 5:00 PM", "Tomorrow · All day", or "Happening now · until 8:00 PM".
function whenText(event: DashboardEvent, now: Date): string {
  const start = startOf(event);
  const end = endOf(event);
  if (start <= now && now < end) {
    return event.allDay
      ? "Happening now · All day"
      : `Happening now · until ${timeOf(end)}`;
  }
  return `${dayWord(start, now)} · ${event.allDay ? "All day" : timeOf(start)}`;
}

// A calendar page: the month in a maroon strip, the day number big underneath.
function DateTile({ date }: { date: Date }) {
  return (
    <span className="block w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-white text-center shadow-soft">
      <span className="block bg-maroon-500 py-0.5 text-[11px] font-bold tracking-wider text-gold-300 uppercase">
        {date.toLocaleDateString(undefined, { month: "short" })}
      </span>
      <span className="block py-1 text-2xl leading-none font-extrabold text-ink">
        {date.getDate()}
      </span>
    </span>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

function EventBody({ event, now }: { event: DashboardEvent; now: Date }) {
  return (
    <span className="flex items-center gap-4">
      <DateTile date={startOf(event)} />
      <span className="block min-w-0 flex-1">
        <span className="block text-xs font-bold tracking-wide text-maroon-500 uppercase">
          {event.calendar}
        </span>
        <span className="block truncate text-lg font-bold text-ink">
          {event.title}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-sm text-ink/70">
          <Icon>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </Icon>
          {whenText(event, now)}
        </span>
        {event.location && (
          <span className="mt-0.5 flex items-center gap-1.5 text-sm text-ink/60">
            <Icon>
              <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </Icon>
            <span className="truncate">{event.location}</span>
          </span>
        )}
      </span>
    </span>
  );
}

// "Upcoming events": the next event in front, and the one after it peeking out from behind
// like the next card in a stack. Tapping the stack brings the second one forward.
export default function EventsCard() {
  const { state } = useCard<DashboardEventsResponse>("/api/dashboard/events");
  const [flipped, setFlipped] = useState(false);
  const now = useNow();

  if (state.status === "loading") {
    return (
      <section className="card" aria-label="Upcoming events">
        <p className="text-sm text-ink/60">Loading events…</p>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="card" aria-label="Upcoming events">
        <p role="alert" className="text-sm text-red-800">
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
        <p className="text-sm text-ink/70">No upcoming events.</p>
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
              Then: {back.title} · {whenText(back, now)}
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
            <EventBody event={front} now={now} />
          </button>
        ) : (
          <div className="card">
            <EventBody event={front} now={now} />
          </div>
        )}
      </div>
      {note}
    </section>
  );
}
