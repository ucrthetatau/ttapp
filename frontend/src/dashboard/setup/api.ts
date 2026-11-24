import type {
  DashboardSourcesResponse,
  InspectSheetResponse,
  RemindersPreviewResponse,
  SaveSourceResponse,
  SendRemindersResponse,
  SheetTabsResponse,
  TestReminderResponse,
} from "@ttapp/shared";
import { readError } from "../../common/readError.ts";

export type SaveResult =
  | { ok: true; saved: SaveSourceResponse }
  | { ok: false; message: string; problems: string[] };
export type PlainResult = { ok: true } | { ok: false; message: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

// Reads { error, problems } for forms that list every problem found. Sheet problems arrive
// as plain strings, which the shared readError would flatten to just one.
async function readProblems(
  res: Response,
): Promise<{ message: string; problems: string[] }> {
  try {
    const body = (await res.clone().json()) as {
      error?: string;
      problems?: (string | { message: string })[];
    };
    const problems = (body.problems ?? []).map((p) =>
      typeof p === "string" ? p : p.message,
    );
    return { message: body.error ?? "Something went wrong.", problems };
  } catch {
    return { message: await readError(res), problems: [] };
  }
}

export async function loadSources(): Promise<
  { ok: true; data: DashboardSourcesResponse } | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/dashboard/sources");
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true, data: (await res.json()) as DashboardSourcesResponse };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

export type InspectResult =
  | { ok: true; inspected: InspectSheetResponse }
  | { ok: false; message: string };

// POST /api/dashboard/sources/inspect: step one. Reads the top of the tab and answers with the
// header cells that can be picked and a best guess for each column. Nothing is saved.
export async function inspectSheet(
  kind: "dues" | "requirements",
  link: string,
): Promise<InspectResult> {
  try {
    const res = await fetch("/api/dashboard/sources/inspect", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ kind, link }),
    });
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true, inspected: (await res.json()) as InspectSheetResponse };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

// PUT /api/dashboard/sources/:kind: step two. The backend reads the sheet and checks the
// chosen columns BEFORE saving.
export async function saveSheet(
  kind: "dues" | "requirements",
  link: string,
  columns: Record<string, string>,
  threshold?: number,
): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/dashboard/sources/${kind}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ link, columns, threshold }),
    });
    if (!res.ok) return { ok: false, ...(await readProblems(res)) };
    return { ok: true, saved: (await res.json()) as SaveSourceResponse };
  } catch {
    return { ok: false, message: "Can't reach the server.", problems: [] };
  }
}

// GET /api/dashboard/sources/:kind/tabs: every tab of the saved file, read fresh from Google.
export async function loadTabs(
  kind: "dues" | "requirements",
): Promise<
  { ok: true; data: SheetTabsResponse } | { ok: false; message: string }
> {
  try {
    const res = await fetch(`/api/dashboard/sources/${kind}/tabs`);
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true, data: (await res.json()) as SheetTabsResponse };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

// PUT /api/dashboard/sources/:kind/tab: moves to another tab of the same file. The backend
// checks the new tab fits the chosen columns BEFORE it changes anything.
export async function switchTab(
  kind: "dues" | "requirements",
  gid: number,
): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/dashboard/sources/${kind}/tab`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ gid }),
    });
    if (!res.ok) return { ok: false, ...(await readProblems(res)) };
    return { ok: true, saved: (await res.json()) as SaveSourceResponse };
  } catch {
    return { ok: false, message: "Can't reach the server.", problems: [] };
  }
}

export async function saveThreshold(threshold: number): Promise<PlainResult> {
  try {
    const res = await fetch("/api/dashboard/sources/requirements/threshold", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ threshold }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

export async function addCalendar(
  label: string,
  calendarId: string,
): Promise<SaveResult> {
  try {
    const res = await fetch("/api/dashboard/sources/calendars", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ label, calendarId }),
    });
    if (!res.ok) return { ok: false, ...(await readProblems(res)) };
    return { ok: true, saved: (await res.json()) as SaveSourceResponse };
  } catch {
    return { ok: false, message: "Can't reach the server.", problems: [] };
  }
}

export async function removeSource(id: string): Promise<PlainResult> {
  try {
    const res = await fetch(`/api/dashboard/sources/${id}`, {
      method: "DELETE",
    });
    if (res.ok) return { ok: true };
    return { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

// GET /api/dashboard/reminders: who a dues reminder would reach and who it can't. Reads the
// dues sheet, so it is only asked for when an officer opens the pop-up. Nothing is sent.
export async function loadReminders(): Promise<
  { ok: true; data: RemindersPreviewResponse } | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/dashboard/reminders");
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true, data: (await res.json()) as RemindersPreviewResponse };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

// POST /api/dashboard/reminders/send: the only thing sent is the due date. The backend works
// out who owes what again from the sheet.
export async function sendReminders(
  dueDate: string,
): Promise<
  { ok: true; result: SendRemindersResponse } | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/dashboard/reminders/send", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ dueDate }),
    });
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true, result: (await res.json()) as SendRemindersResponse };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

// POST /api/dashboard/reminders/test: the same notification, sent only to the officer.
export async function sendTestReminder(
  dueDate: string,
): Promise<
  { ok: true; result: TestReminderResponse } | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/dashboard/reminders/test", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ dueDate }),
    });
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true, result: (await res.json()) as TestReminderResponse };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}
