// Reading the dues and requirements sheets, following the officers' template:
//   dues tab          EMAIL, STATUS, AMOUNT CHARGED, AMOUNT PAID
//   requirements tab  EMAIL, REQ %
// Columns are found by their header NAME, not their letter, and the header row can be
// anywhere near the top, so officers can add or move other columns freely. Everything below
// the parsing is plain functions of the sheet's text, so it can be checked without Google.
import type { SourceCheckReport } from "@ttapp/shared";
import { GoogleError, cached, googleGet } from "./google.ts";

export type SheetKind = "dues" | "requirements";

const REQUIRED: Record<SheetKind, string[]> = {
  dues: ["EMAIL", "STATUS", "AMOUNT CHARGED", "AMOUNT PAID"],
  requirements: ["EMAIL", "REQ %"],
};
const HEADER_SEARCH_ROWS = 10;
const PREVIEW_ROWS = 5;
const MAX_LISTED = 20;

// ---------------------------------------------------------------------------------------
// The pasted link
// ---------------------------------------------------------------------------------------

/**
 * Pulls the spreadsheet ID and tab number out of the address an officer copied from the
 * browser. Only these two values are kept: the app never fetches the pasted address itself.
 */
export function parseSheetLink(
  link: string,
): { id: string; gid: number } | { error: string } {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return { error: "That isn't a web address. Copy it from the browser bar" };
  }
  const match = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/.exec(
    url.pathname,
  );
  if (url.hostname !== "docs.google.com" || !match) {
    return { error: "That isn't a Google Sheets link" };
  }
  const gid = /(?:^|[?&#])gid=(\d{1,10})(?:&|$)/.exec(url.search + url.hash);
  if (!gid) {
    return {
      error:
        "Open the tab you want, then copy the address from the browser bar (it must contain gid=)",
    };
  }
  const number = Number(gid[1]);
  if (number > 2_147_483_647) return { error: "That tab number is too large" };
  return { id: match[1], gid: number };
}

/** The link members and officers can open. */
export function sheetUrl(id: string, gid: number): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit?gid=${gid}`;
}

// ---------------------------------------------------------------------------------------
// Parsing the table
// ---------------------------------------------------------------------------------------

const normalize = (text: string) =>
  text.trim().replace(/\s+/g, " ").toUpperCase();

/** "$1,200.50" -> 1200.5; blank -> 0; anything else -> null (not a number). */
export function parseMoney(text: string): number | null {
  const cleaned = text.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * "85%" -> 85. A plain number up to 1 is read as a fraction (0.85 -> 85); above 1 it is
 * already a percentage. Blank or text -> null.
 */
export function parsePercent(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, "");
  if (cleaned === "") return null;
  const hasSign = cleaned.endsWith("%");
  const n = Number(hasSign ? cleaned.slice(0, -1) : cleaned);
  if (!Number.isFinite(n)) return null;
  const percent = !hasSign && n <= 1 ? n * 100 : n;
  return Math.round(percent * 10) / 10;
}

export type SheetRow = {
  rowNumber: number; // as shown in the sheet
  email: string; // lowercase
  cells: Record<string, string>; // required headers only, by normalized header name
};

export type SheetTable = {
  headers: string[]; // the required headers, in order
  rows: SheetRow[];
  /** Problems that make the whole sheet unusable: no header row, a missing header. */
  fatal: string[];
  /** Emails that appear on more than one row, with the row numbers. */
  duplicates: Map<string, number[]>;
};

/** Finds the header row by looking for EMAIL, then reads the rows under it. */
export function parseTable(rows: string[][], kind: SheetKind): SheetTable {
  const wanted = REQUIRED[kind];
  const table: SheetTable = {
    headers: wanted,
    rows: [],
    fatal: [],
    duplicates: new Map(),
  };

  const headerIndex = rows
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex((row) => row.some((cell) => normalize(cell) === "EMAIL"));
  if (headerIndex === -1) {
    table.fatal.push(
      `No EMAIL column found in the first ${HEADER_SEARCH_ROWS} rows`,
    );
    return table;
  }

  const columns = new Map<string, number>();
  rows[headerIndex].forEach((cell, index) => {
    const name = normalize(cell);
    if (name && !columns.has(name)) columns.set(name, index); // first one wins
  });
  const missing = wanted.filter((name) => !columns.has(name));
  if (missing.length > 0) {
    table.fatal.push(
      `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    );
    return table;
  }

  const seen = new Map<string, number[]>();
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + 2 + offset;
    const email = (row[columns.get("EMAIL")!] ?? "").trim().toLowerCase();
    if (!email) return; // empty rows and spacer rows are fine
    const cells: Record<string, string> = {};
    for (const name of wanted) cells[name] = row[columns.get(name)!] ?? "";
    table.rows.push({ rowNumber, email, cells });
    seen.set(email, [...(seen.get(email) ?? []), rowNumber]);
  });
  for (const [email, numbers] of seen) {
    if (numbers.length > 1) table.duplicates.set(email, numbers);
  }
  return table;
}

/** Everything wrong with the sheet, for the save check. Fatal and duplicate problems block. */
export function blockingProblems(table: SheetTable): string[] {
  const problems = [...table.fatal];
  for (const [email, numbers] of table.duplicates) {
    problems.push(`${maskEmail(email)} is on rows ${numbers.join(" and ")}`);
  }
  return problems;
}

/** Rows whose numbers can't be read. Shown as warnings; that member sees an error. */
export function cellWarnings(table: SheetTable, kind: SheetKind): string[] {
  const warnings: string[] = [];
  for (const row of table.rows) {
    if (kind === "requirements") {
      if (parsePercent(row.cells["REQ %"]) === null) {
        warnings.push(`Row ${row.rowNumber}: REQ % isn't a number`);
      }
    } else {
      for (const name of ["AMOUNT CHARGED", "AMOUNT PAID"]) {
        if (parseMoney(row.cells[name]) === null) {
          warnings.push(`Row ${row.rowNumber}: ${name} isn't a number`);
        }
      }
    }
  }
  return warnings;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return `${email.slice(0, 2)}***`;
  return `${local.slice(0, 2)}***@${domain}`;
}

/** The save check's report. Counts and the preview are information; none of it blocks. */
export function buildReport(
  table: SheetTable,
  kind: SheetKind,
  tabName: string,
  memberEmails: Set<string>,
): SourceCheckReport {
  const sheetEmails = new Set(table.rows.map((row) => row.email));
  const unmatched = [...sheetEmails].filter(
    (email) => !memberEmails.has(email),
  );
  const valueHeaders = table.headers.filter((name) => name !== "EMAIL");
  return {
    name: tabName,
    rows: sheetEmails.size,
    matched: sheetEmails.size - unmatched.length,
    unmatchedEmails: unmatched.slice(0, MAX_LISTED),
    membersWithoutRow: [...memberEmails].filter((e) => !sheetEmails.has(e))
      .length,
    previewHeaders: valueHeaders,
    preview: table.rows.slice(0, PREVIEW_ROWS).map((row) => ({
      email: maskEmail(row.email),
      cells: valueHeaders.map((name) => row.cells[name]),
    })),
    warnings: cellWarnings(table, kind).slice(0, MAX_LISTED),
  };
}

// ---------------------------------------------------------------------------------------
// Reading from Google
// ---------------------------------------------------------------------------------------

type Tab = { tabName: string; rows: string[][] };

async function readTab(id: string, gid: number): Promise<Tab> {
  const meta = (await googleGet(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`,
  )) as { sheets?: { properties: { sheetId: number; title: string } }[] };
  const tab = meta.sheets?.find((s) => s.properties.sheetId === gid);
  if (!tab) {
    throw new GoogleError(
      "That tab wasn't found in the sheet. Open the tab you want and copy the link again",
      "no_access",
    );
  }
  const title = tab.properties.title;
  const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'`);
  const body = (await googleGet(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?majorDimension=ROWS`,
  )) as { values?: unknown[][] };
  const rows = (body.values ?? []).map((row) =>
    row.map((cell) => String(cell ?? "")),
  );
  return { tabName: title, rows };
}

/** Reads a tab fresh from Google (used when an officer saves a link). */
export async function readTabFresh(id: string, gid: number) {
  const { tabName, rows } = await readTab(id, gid);
  return { tabName, rows };
}

/** Reads and parses a tab, shared for a minute between members (used by the dashboard). */
export function readTable(id: string, gid: number, kind: SheetKind) {
  return cached(`sheet:${kind}:${id}:${gid}`, async () => {
    const { rows } = await readTab(id, gid);
    return parseTable(rows, kind);
  });
}

/**
 * The signed-in member's own row, or null if they have none. Throws GoogleError("failed")
 * if the sheet is no longer in the template shape, or their own row is unusable, so the
 * card says "not available" and never shows a guess.
 */
export function findOwnRow(table: SheetTable, email: string): SheetRow | null {
  const label =
    "The sheet isn't set up the way the app expects. Ask an officer";
  if (table.fatal.length > 0) throw new GoogleError(label, "failed");
  const mine = email.trim().toLowerCase();
  if (table.duplicates.has(mine)) throw new GoogleError(label, "failed");
  return table.rows.find((row) => row.email === mine) ?? null;
}
