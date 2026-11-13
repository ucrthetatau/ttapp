// Reading the dues and requirements sheets.
//
// Officers pick which column holds what (see the picker on the Dashboard setup page). The
// choice is saved as the column's HEADER TEXT, not its letter, so a sheet can be rearranged:
// the app looks the header up again each time it reads. Rows are matched to members by the
// name from their Google account, or by email when the chosen person column is called EMAIL.
//
// Everything below the "Reading from Google" part is plain functions of the sheet's text, so
// it can be checked without Google.
import type { SheetColumnCandidate, SourceCheckReport } from "@ttapp/shared";
import { GoogleError, cached, googleGet } from "./google.ts";

export type SheetKind = "dues" | "requirements";
export type PersonKind = "name" | "email";
/** role (person, status, charged, paid, percent) -> the header text chosen for it */
export type Columns = Record<string, string>;

/** What each dropdown on the setup page is for, in order. */
export const ROLES: Record<SheetKind, { role: string; label: string }[]> = {
  dues: [
    { role: "person", label: "Member (name or email)" },
    { role: "status", label: "Status" },
    { role: "charged", label: "Amount charged" },
    { role: "paid", label: "Amount paid" },
  ],
  requirements: [
    { role: "person", label: "Member (name or email)" },
    { role: "percent", label: "Percentage" },
  ],
};

// Used for a source saved without a choice (older rows): the officers' template names.
export const TEMPLATE_COLUMNS: Record<SheetKind, Columns> = {
  dues: {
    person: "EMAIL",
    status: "STATUS",
    charged: "AMOUNT CHARGED",
    paid: "AMOUNT PAID",
  },
  requirements: { person: "EMAIL", percent: "REQ %" },
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
// Text helpers
// ---------------------------------------------------------------------------------------

/** Header text compared without caring about case or extra spaces. */
export const normalize = (text: string) =>
  text.trim().replace(/\s+/g, " ").toUpperCase();

/** A person column called EMAIL matches by email; any other name matches by name. */
export const personKindOf = (header: string): PersonKind =>
  normalize(header) === "EMAIL" ? "email" : "name";

/**
 * A name made comparable: no capitals, accents or punctuation, single spaces. "José  O'Neil"
 * and "jose o neil" are the same. Only an exact match after this counts: there is no
 * "close enough", because a wrong match would show someone's dues to the wrong person.
 */
export function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/**
 * A name reduced to its first and last word, so a middle name (or initial, or a "Jr.") does not
 * matter: "Charles Alan Luo" and "Charles Luo" both become "charles luo". Only used as a second
 * try, after the exact name, and only when it is unambiguous (see matchMember).
 */
export function looseKey(text: string): string {
  const words = normalizeName(text)
    .split(" ")
    .filter((word) => word && !NAME_SUFFIXES.has(word));
  if (words.length <= 1) return words[0] ?? "";
  return `${words[0]} ${words[words.length - 1]}`;
}

/** What rows and members are compared by. Empty means "can't be matched". */
export function personKey(kind: PersonKind, value: string): string {
  return kind === "email" ? value.trim().toLowerCase() : normalizeName(value);
}

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

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return `${email.slice(0, 2)}***`;
  return `${local.slice(0, 2)}***@${domain}`;
}

/** "Charles Luo" -> "Charles L." for the preview. */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

const maskPerson = (kind: PersonKind, value: string) =>
  kind === "email" ? maskEmail(value) : maskName(value);

function columnLetter(index: number): string {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

// ---------------------------------------------------------------------------------------
// The header area
// ---------------------------------------------------------------------------------------

// A cell that only data has: a percentage, a dollar amount, or a checkbox. Plain numbers do
// not count, because header rows often number their columns (1, 2, 3).
const isDataLike = (cell: string) => {
  const text = cell.trim();
  return (
    /^(true|false)$/i.test(text) ||
    /^[$€£]\s*[\d,.]+$/.test(text) ||
    /^[\d,.]+\s*%$/.test(text)
  );
};

/**
 * How many rows at the top are headers: everything above the first row that looks like data
 * (it holds a percentage, an amount or a checkbox). Sheets with a title row and group labels
 * above the real headers work too. If nothing looks like data, the first two rows.
 */
export function headerRowCount(rows: string[][]): number {
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  for (let i = 0; i < limit; i++) {
    if (rows[i].some(isDataLike)) return Math.max(i, 1);
  }
  return Math.min(limit, 2);
}

type HeaderCell = { text: string; norm: string; row: number; col: number };

function headerCells(rows: string[][], zone: number): HeaderCell[] {
  const cells: HeaderCell[] = [];
  rows.slice(0, zone).forEach((row, r) =>
    row.forEach((text, c) => {
      const norm = normalize(text);
      if (norm) cells.push({ text: text.trim(), norm, row: r, col: c });
    }),
  );
  return cells;
}

/** The header cells an officer can pick: the ones whose text appears only once up there. */
export function candidates(rows: string[][]): SheetColumnCandidate[] {
  const cells = headerCells(rows, headerRowCount(rows));
  const seen = new Map<string, number>();
  for (const cell of cells) seen.set(cell.norm, (seen.get(cell.norm) ?? 0) + 1);
  return cells
    .filter((cell) => seen.get(cell.norm) === 1)
    .map((cell) => ({
      text: cell.text,
      cell: `${columnLetter(cell.col)}${cell.row + 1}`,
    }));
}

function pick(list: SheetColumnCandidate[], tests: RegExp[]): string | null {
  for (const test of tests) {
    const found = list.find((c) => test.test(c.text));
    if (found) return found.text;
  }
  return null;
}

/** The best guess for each dropdown, by header wording. The officer confirms it. */
export function suggest(
  kind: SheetKind,
  list: SheetColumnCandidate[],
): Record<string, string | null> {
  const person = pick(list, [
    /^e-?mail$/i,
    /^(members?|brothers?|names?|full name)$/i,
    /member|brother|name/i,
  ]);
  if (kind === "requirements") {
    return { person, percent: pick(list, [/%/, /percent/i]) };
  }
  return {
    person,
    status: pick(list, [/^status$/i, /status/i]),
    charged: pick(list, [/^amount charged$/i, /charged/i]),
    paid: pick(list, [/^amount paid$/i, /^paid$/i]),
  };
}

// ---------------------------------------------------------------------------------------
// Parsing the table
// ---------------------------------------------------------------------------------------

export type SheetRow = {
  rowNumber: number; // as shown in the sheet
  key: string; // what it is matched by (lowercase email, or normalized name)
  loose: string; // first + last word of a name (the same as key for emails)
  display: string; // as written in the sheet
  cells: Record<string, string>; // by role, for the chosen columns
};

export type SheetTable = {
  person: PersonKind;
  headers: Columns; // the header text used for each role
  roles: string[];
  rows: SheetRow[];
  /** Problems that make the whole sheet unusable: a chosen header is missing or ambiguous. */
  fatal: string[];
  /** Keys that appear on more than one row, with the row numbers. */
  duplicates: Map<string, { display: string; rows: number[] }>;
};

/** Finds each chosen header in the header area, then reads the rows below it. */
export function parseTable(
  rows: string[][],
  kind: SheetKind,
  columns: Columns,
): SheetTable {
  const roles = ROLES[kind].map((r) => r.role);
  const table: SheetTable = {
    person: personKindOf(columns.person ?? ""),
    headers: columns,
    roles,
    rows: [],
    fatal: [],
    duplicates: new Map(),
  };

  const zone = headerRowCount(rows);
  const cells = headerCells(rows, zone);
  const where: Record<string, number> = {};
  for (const { role, label } of ROLES[kind]) {
    const header = columns[role];
    if (!header?.trim()) {
      table.fatal.push(`No column chosen for ${label.toLowerCase()}`);
      continue;
    }
    const matches = cells.filter((cell) => cell.norm === normalize(header));
    const places = new Set(matches.map((cell) => cell.col));
    if (places.size === 0) {
      table.fatal.push(`Column “${header.trim()}” wasn't found`);
    } else if (places.size > 1) {
      table.fatal.push(`“${header.trim()}” appears in more than one column`);
    } else {
      where[role] = matches[0].col;
    }
  }
  if (table.fatal.length > 0) return table;

  const seen = new Map<string, { display: string; rows: number[] }>();
  rows.slice(zone).forEach((row, offset) => {
    const rowNumber = zone + 1 + offset;
    const display = (row[where.person] ?? "").trim();
    const key = personKey(table.person, display);
    if (!key) return; // empty rows and spacer rows are fine
    const values: Record<string, string> = {};
    for (const role of roles) values[role] = row[where[role]] ?? "";
    const loose = table.person === "name" ? looseKey(display) : key;
    table.rows.push({ rowNumber, key, loose, display, cells: values });
    const entry = seen.get(key) ?? { display, rows: [] };
    entry.rows.push(rowNumber);
    seen.set(key, entry);
  });
  for (const [key, entry] of seen) {
    if (entry.rows.length > 1) table.duplicates.set(key, entry);
  }
  return table;
}

/** Problems that stop a save: a missing column, or the same person on two rows. */
export function blockingProblems(table: SheetTable): string[] {
  const problems = [...table.fatal];
  for (const entry of table.duplicates.values()) {
    problems.push(
      `${maskPerson(table.person, entry.display)} is on rows ${entry.rows.join(" and ")}`,
    );
  }
  return problems;
}

/** Cells whose numbers can't be read. Shown as warnings; that member sees an error. */
export function cellWarnings(table: SheetTable, kind: SheetKind): string[] {
  const warnings: string[] = [];
  for (const row of table.rows) {
    if (kind === "requirements") {
      if (parsePercent(row.cells.percent) === null) {
        warnings.push(`Row ${row.rowNumber}: the percentage isn't a number`);
      }
    } else {
      for (const [role, label] of [
        ["charged", "amount charged"],
        ["paid", "amount paid"],
      ]) {
        if (parseMoney(row.cells[role]) === null) {
          warnings.push(`Row ${row.rowNumber}: the ${label} isn't a number`);
        }
      }
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------------------
// Matching members to rows
// ---------------------------------------------------------------------------------------

export type MemberRef = { email: string; name: string | null };

function memberKeys(person: PersonKind, member: MemberRef) {
  if (person === "email") {
    return { full: personKey("email", member.email) || null, loose: null };
  }
  const name = member.name ?? "";
  return { full: normalizeName(name) || null, loose: looseKey(name) || null };
}

/** How many active members share each exact name and each first+last name. */
export type MemberIndex = {
  full: Map<string, number>;
  loose: Map<string, number>;
};

export function indexMembers(
  person: PersonKind,
  members: MemberRef[],
): MemberIndex {
  const index: MemberIndex = { full: new Map(), loose: new Map() };
  for (const member of members) {
    const { full, loose } = memberKeys(person, member);
    if (full) index.full.set(full, (index.full.get(full) ?? 0) + 1);
    if (loose) index.loose.set(loose, (index.loose.get(loose) ?? 0) + 1);
  }
  return index;
}

// Why a match was refused: "members" = another member has the same name, "rows" = the name is
// on more than one row of the sheet. Used to tell the member what is actually wrong.
export type Match =
  | { row: SheetRow; how: "exact" | "loose" }
  | { row: null; refused: false }
  | { row: null; refused: true; why: "members" | "rows" };

/**
 * Finds a member's row in two tiers, and refuses (never guesses) when it is unclear.
 *   1. The exact name (after tidying case, accents and punctuation). Refused if two sheet rows
 *      or two members share it.
 *   2. Only if there is no exact row: first word + last word, so a middle name or initial does
 *      not matter. It is used only when exactly one sheet row and exactly one member share that
 *      first+last name, and that row is not the exact name of some other member (so "Ann Lee"
 *      is never taken by "Ann Marie Lee" while a real "Ann Lee" exists).
 * "refused: true" means the match was ambiguous, "refused: false" means simply no row.
 */
export function matchMember(
  table: SheetTable,
  member: MemberRef,
  index: MemberIndex,
): Match {
  const { full, loose } = memberKeys(table.person, member);
  if (!full) return { row: null, refused: false };

  const exact = table.rows.filter((row) => row.key === full);
  if (exact.length > 0) {
    if (exact.length > 1) return { row: null, refused: true, why: "rows" };
    if ((index.full.get(full) ?? 0) > 1) {
      return { row: null, refused: true, why: "members" };
    }
    return { row: exact[0], how: "exact" };
  }

  if (table.person !== "name" || !loose) return { row: null, refused: false };
  const near = table.rows.filter((row) => row.loose === loose);
  if (near.length === 0) return { row: null, refused: false };
  if (near.length > 1) return { row: null, refused: true, why: "rows" };
  if ((index.loose.get(loose) ?? 0) > 1 || index.full.has(near[0].key)) {
    return { row: null, refused: true, why: "members" };
  }
  return { row: near[0], how: "loose" };
}

/** The save check's report. Counts and the preview are information; none of it blocks. */
export function buildReport(
  table: SheetTable,
  kind: SheetKind,
  tabName: string,
  everyone: MemberRef[],
): SourceCheckReport {
  const index = indexMembers(table.person, everyone);
  const matchedRows = new Set<number>();
  const looseMatches: { sheet: string; member: string }[] = [];
  let ambiguous = 0;
  let withoutRow = 0;
  let withoutName = 0;
  for (const member of everyone) {
    if (!memberKeys(table.person, member).full) {
      withoutName++;
      continue;
    }
    const match = matchMember(table, member, index);
    if (match.row) {
      matchedRows.add(match.row.rowNumber);
      if (match.how === "loose") {
        looseMatches.push({
          sheet: match.row.display,
          member: member.name ?? "",
        });
      }
    } else if (match.refused) {
      ambiguous++;
    } else {
      withoutRow++;
    }
  }

  const valueRoles = table.roles.filter((role) => role !== "person");
  const unmatched = table.rows.filter((row) => !matchedRows.has(row.rowNumber));
  return {
    name: tabName,
    rows: table.rows.length,
    matched: matchedRows.size,
    matchBy: table.person,
    unmatched: [...new Set(unmatched.map((row) => row.display))].slice(
      0,
      MAX_LISTED,
    ),
    membersWithoutRow: withoutRow,
    membersWithoutName: table.person === "name" ? withoutName : null,
    looseMatches: looseMatches.slice(0, MAX_LISTED),
    ambiguousMembers: ambiguous,
    previewHeaders: valueRoles.map((role) => table.headers[role]),
    preview: table.rows.slice(0, PREVIEW_ROWS).map((row) => ({
      email: maskPerson(table.person, row.display),
      cells: valueRoles.map((role) => row.cells[role]),
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

/** Reads a tab fresh from Google (used when an officer checks or saves a link). */
export const readTabFresh = readTab;

/** The tab's rows, shared for a minute between members (used by the dashboard). */
export function readRows(id: string, gid: number) {
  return cached(`sheet:${id}:${gid}`, () => readTab(id, gid));
}

// What a member is told when the app refuses to guess. Each says what is actually wrong and
// who can fix it, so they know whether to talk to an officer about the sheet or their account.
export const MESSAGES = {
  columns:
    "The sheet's columns have changed. An officer needs to update Dashboard setup",
  members:
    "Another member has the same name as you, so the app can't tell which row is yours. Ask an officer",
  rows: "Your name is on more than one row of the sheet. Ask an officer to fix the sheet",
} as const;

/**
 * The signed-in member's own row, or null if they have none. Throws GoogleError("failed") with
 * a specific message if the chosen columns can't be found any more, or the match is unclear
 * (two rows or two members with the same name), so the card never shows a guess.
 */
export function findOwnRow(
  table: SheetTable,
  member: MemberRef,
  everyone: MemberRef[],
): SheetRow | null {
  if (table.fatal.length > 0) throw new GoogleError(MESSAGES.columns, "failed");
  const match = matchMember(
    table,
    member,
    indexMembers(table.person, everyone),
  );
  if (match.row === null) {
    if (match.refused) throw new GoogleError(MESSAGES[match.why], "failed");
    return null;
  }
  if (table.duplicates.has(match.row.key)) {
    throw new GoogleError(MESSAGES.rows, "failed");
  }
  return match.row;
}
