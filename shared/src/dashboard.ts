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
  /** Sheets only: the header text chosen for each column, by role (person, status, ...). */
  columns: Record<string, string> | null;
};

/** Response from GET /api/dashboard/sources. */
export type DashboardSourcesResponse = {
  sources: DashboardSource[];
  /** The address officers must share each sheet and calendar with, or null if no key is set. */
  serviceAccountEmail: string | null;
};

/** One header cell an officer can pick, e.g. { text: ">80%?", cell: "AM2" }. */
export type SheetColumnCandidate = { text: string; cell: string };

/** Response from POST /api/dashboard/sources/inspect: what the picker offers. */
export type InspectSheetResponse = {
  tabName: string;
  /** What each dropdown is for, in order: role is the key used in `columns`. */
  roles: { role: string; label: string }[];
  /** Header cells found at the top of the tab that are unique, so they can be picked. */
  candidates: SheetColumnCandidate[];
  /** The best guess for each role (a candidate's text), or null when nothing fits. */
  suggestions: Record<string, string | null>;
};

/** What the save check found. Shown once to the officer who saved; never stored. */
export type SourceCheckReport = {
  /** The tab or calendar that was read, so the officer can confirm it is the right one. */
  name: string;
  /** Sheets only. */
  rows: number | null;
  matched: number | null;
  /** How rows are matched to members: by the name from their Google account, or by email. */
  matchBy: "name" | "email" | null;
  /** Sheet names (or emails) that match no member. Info only: test accounts are normal. */
  unmatched: string[];
  /** Active members with no row in the sheet. */
  membersWithoutRow: number | null;
  /** Matching by name only: members who have not signed in yet, so the app has no name. */
  membersWithoutName: number | null;
  /** Rows matched by first and last name only (the middle name differs or is missing). */
  looseMatches: { sheet: string; member: string }[];
  /** Members who share a name with someone else, so they are shown nothing rather than a guess. */
  ambiguousMembers: number | null;
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
