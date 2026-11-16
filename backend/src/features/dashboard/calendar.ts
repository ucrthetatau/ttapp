// Reading upcoming events from Google Calendar. Events are only read, never stored: there is
// no events table, so the calendar stays the single place officers edit.
import type { DashboardEvent } from "@ttapp/shared";
import { cached, googleGet } from "./google.ts";

type GoogleEvent = {
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type CalendarRead = {
  name: string;
  events: Omit<DashboardEvent, "calendar">[];
};

function toEvent(item: GoogleEvent): Omit<DashboardEvent, "calendar"> | null {
  const start = item.start?.dateTime ?? item.start?.date;
  const end = item.end?.dateTime ?? item.end?.date;
  if (!start || !end) return null;
  return {
    title: item.summary?.trim() || "(No title)",
    start,
    end,
    allDay: !item.start?.dateTime,
    location: item.location?.trim() || null,
  };
}

// The next `max` events of one calendar. Events still in progress count as upcoming.
async function read(calendarId: string, max: number): Promise<CalendarRead> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    singleEvents: "true", // repeating events appear one by one
    orderBy: "startTime",
    maxResults: String(max),
    fields: "summary,items(summary,location,start,end)",
  });
  const body = (await googleGet(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
  )) as { summary?: string; items?: GoogleEvent[] };
  return {
    name: body.summary ?? "Calendar",
    events: (body.items ?? []).flatMap((item) => toEvent(item) ?? []),
  };
}

// How many upcoming events the dashboard shows: the next one on the card and the next three in
// its pop-up. Each calendar is asked for this many, then the calendars are merged and cut again.
export const SHOWN_EVENTS = 3;

/** Shared for a minute between members. Always asks for SHOWN_EVENTS, the most the dashboard shows. */
export function readCalendar(calendarId: string) {
  return cached(`calendar:${calendarId}`, () => read(calendarId, SHOWN_EVENTS));
}

/** Fresh read for the save check. Throws GoogleError if the calendar can't be opened. */
export function checkCalendar(calendarId: string) {
  return read(calendarId, 1);
}
