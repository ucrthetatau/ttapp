import type {
  DashboardSourcesResponse,
  SaveSourceResponse,
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

// PUT /api/dashboard/sources/:kind. The backend reads the sheet and checks it BEFORE saving.
export async function saveSheet(
  kind: "dues" | "requirements",
  link: string,
  threshold?: number,
): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/dashboard/sources/${kind}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ link, threshold }),
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
