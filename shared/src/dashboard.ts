// Types for the dashboard: where it reads from, and what members see.
// Sheets and calendars live in Google; the backend reads them and sends only what a member
// may see (their own row, never anyone else's).

/** One place the dashboard reads from, as shown to officers. */
export type DashboardSource = {
  id: string;
  kind: "dues" | "requirements" | "calendar";
  label: string;
  /** A link to open it (sheets only). */
  url: string | null;
  /** Requirements only: the percentage at or above which a member is on track. */
  threshold: number | null;
};

/** Response from GET /api/dashboard/sources. */
export type DashboardSourcesResponse = {
  sources: DashboardSource[];
  /** The address officers must share each sheet and calendar with, or null if no key is set. */
  serviceAccountEmail: string | null;
};

/** What the save check found. Shown once to the officer who saved; never stored. */
export type SourceCheckReport = {
  /** The tab or calendar that was read, so the officer can confirm it is the right one. */
  name: string;
  /** Sheets only. */
  rows: number | null;
  matched: number | null;
  /** Sheet emails that are not members (info only; test emails are normal). */
  unmatchedEmails: string[];
  /** Active members with no row in the sheet. */
  membersWithoutRow: number | null;
  /** The first few rows with the email partly hidden. */
  preview: { email: string; cells: string[] }[];
  previewHeaders: string[];
  /** Cells that could not be read (a percentage that is text, say). Do not block saving. */
  warnings: string[];
};

/** Response from PUT/POST on /api/dashboard/sources. */
export type SaveSourceResponse = {
  source: DashboardSource;
  report: SourceCheckReport;
};

/** Response from GET /api/dashboard/me/dues. */
export type MyDuesResponse =
  | { configured: false }
  | {
      configured: true;
      found: false;
    }
  | {
      configured: true;
      found: true;
      status: string;
      charged: number;
      paid: number;
      stillToPay: number; // charged minus paid, never below zero
    };

/** Response from GET /api/dashboard/me/requirements. */
export type MyRequirementsResponse =
  | { configured: false }
  | { configured: true; found: false; sheetUrl: string }
  | {
      configured: true;
      found: true;
      percent: number;
      threshold: number;
      onTrack: boolean;
      sheetUrl: string;
    };

/** One upcoming event. */
export type DashboardEvent = {
  title: string;
  start: string; // ISO time, or a plain date (2026-11-20) when allDay
  end: string;
  allDay: boolean;
  location: string | null;
  calendar: string; // the label officers gave the calendar
};

/** Response from GET /api/dashboard/events: the next two events across all calendars. */
export type DashboardEventsResponse = {
  events: DashboardEvent[];
  /** Calendars that could not be read this time; the others still show. */
  failed: string[];
};
