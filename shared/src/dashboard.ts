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
  /** Sheets only: which tab of the file is read (the number in the link's gid=). */
  tabGid: number | null;
};

/** One tab of a Google Sheets file, as the tab picker lists it. */
export type SheetTab = {
  gid: number;
  title: string;
};

/** Response from GET /api/dashboard/sources/:kind/tabs. */
export type SheetTabsResponse = {
  /** Every tab in the saved file, in the order they appear along the bottom of the sheet. */
  tabs: SheetTab[];
  /** The tab being read, or null when it no longer exists (it was deleted). */
  currentGid: number | null;
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
  | { configured: true; found: false; sheetUrl: string }
  | {
      configured: true;
      found: true;
      status: string;
      charged: number;
      paid: number;
      stillToPay: number; // charged minus paid, never below zero
      sheetUrl: string; // the dues sheet, so the details pop-up can link to it
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

/** Response from GET /api/dashboard/events: the next three events across all calendars. */
export type DashboardEventsResponse = {
  events: DashboardEvent[];
  /** Calendars that could not be read this time; the others still show. */
  failed: string[];
};

/** A member and what they still owe, as the officer's reminder pop-up lists them. */
export type ReminderPerson = {
  name: string;
  owes: number; // dollars: charged minus paid, never below zero
};

/** Response from GET /api/dashboard/reminders: who a dues reminder would reach, and who not. */
export type RemindersPreviewResponse =
  | { configured: false }
  | {
      configured: true;
      /** Owe money and have a device with notifications on. */
      willRemind: ReminderPerson[];
      /** Owe money but no device: the officer has to text them. */
      noDevice: ReminderPerson[];
      /** Members the sheet has no row for. */
      noRow: string[];
      /** Members the app refuses to match (same name twice). */
      unclear: string[];
      /** Members whose row has an amount the app can't read. */
      unreadable: string[];
      /** Members who never signed in, so the app has no name to look for. */
      noName: number;
      /** Members who owe nothing. */
      paidUp: number;
      last: {
        sentAt: string;
        sentBy: string | null;
        dueDate: string; // 2026-12-01
        reminded: number;
      } | null;
    };

/** Response from POST /api/dashboard/reminders/send. */
export type SendRemindersResponse = {
  /** Members for whom at least one device took the notification. */
  reminded: number;
  /** Members who owe money but nothing reached them (their device refused it). */
  notDelivered: string[];
};

/** Response from POST /api/dashboard/reminders/test: a test sent only to the officer. */
export type TestReminderResponse = {
  /** How many of the officer's own devices took it. */
  devices: number;
  /** True when the officer owes nothing (or isn't on the sheet), so a sample amount was used. */
  usedSample: boolean;
};
