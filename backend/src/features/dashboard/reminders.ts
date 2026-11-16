// The reminders officers can send: who owes dues, or who is below the requirements threshold,
// worked out from the sheet, and the message each of them gets. The officer's preview and the
// real send call the same function (duesAudience / requirementsAudience), so the list the
// officer approves is made the same way as the list that is used. The send never trusts a list
// from the browser: it asks again here.
import type { ReminderPerson, RequirementPerson } from "@ttapp/shared";
import { eq, isNull } from "drizzle-orm";
import { db } from "../../common/db/client.ts";
import {
  dashboardSources,
  members,
  pushSubscriptions,
} from "../../common/db/schema.ts";
import { GoogleError } from "./google.ts";
import {
  MESSAGES,
  TEMPLATE_COLUMNS,
  indexMembers,
  matchMember,
  parseMoney,
  parsePercent,
  parseTable,
  readRows,
} from "./sheets.ts";
import type { SheetKind } from "./sheets.ts";

const DEFAULT_THRESHOLD = 80;

type SourceRow = typeof dashboardSources.$inferSelect;

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

// What one sheet row means for a reminder.
type Verdict =
  | { state: "unreadable" } // a number in the row can't be read
  | { state: "fine" } // nothing to remind about
  | { state: "remind"; value: number }; // dollars owed, or the percentage reached

type Sorted = {
  /** Need a reminder and have at least one device with notifications on. */
  willRemind: { memberId: string; name: string; value: number }[];
  /** Need a reminder but have no device: the officer has to text them. */
  noDevice: { name: string; value: number }[];
  noRow: string[];
  unclear: string[];
  unreadable: string[];
  noName: number;
  fine: number;
};

async function sourceOfKind(kind: SheetKind): Promise<SourceRow | null> {
  const [source] = await db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.kind, kind));
  return source && source.tabGid !== null ? source : null;
}

/**
 * Reads a sheet and sorts every active member into: will be reminded, needs a reminder but has
 * no device, or can't be reminded (and why). Matching is exactly what each member's own
 * dashboard card uses, so a reminder can never reach someone whose card would say "not found".
 * Throws GoogleError when Google or the saved columns don't work.
 */
async function sortMembers(
  kind: SheetKind,
  source: SourceRow,
  judge: (cells: Record<string, string>) => Verdict,
): Promise<Sorted> {
  const table = parseTable(
    (await readRows(source.googleId, source.tabGid!)).rows,
    kind,
    source.columns ?? TEMPLATE_COLUMNS[kind],
  );
  if (table.fatal.length > 0) throw new GoogleError(MESSAGES.columns, "failed");

  const everyone = await db
    .select({ id: members.id, email: members.email, name: members.name })
    .from(members)
    .where(isNull(members.removedAt));
  const withDevice = new Set(
    (
      await db
        .selectDistinct({ memberId: pushSubscriptions.memberId })
        .from(pushSubscriptions)
    ).map((row) => row.memberId),
  );
  const index = indexMembers(table.person, everyone);

  const sorted: Sorted = {
    willRemind: [],
    noDevice: [],
    noRow: [],
    unclear: [],
    unreadable: [],
    noName: 0,
    fine: 0,
  };
  for (const member of everyone) {
    // Matching by name needs a name; a member who never signed in has none yet.
    if (table.person === "name" && !member.name?.trim()) {
      sorted.noName++;
      continue;
    }
    const label = member.name?.trim() || member.email;
    const match = matchMember(table, member, index);
    if (match.row === null) {
      (match.refused ? sorted.unclear : sorted.noRow).push(label);
      continue;
    }
    // The same person on two sheet rows is never guessed at.
    if (table.duplicates.has(match.row.key)) {
      sorted.unclear.push(label);
      continue;
    }
    const verdict = judge(match.row.cells);
    if (verdict.state === "unreadable") {
      sorted.unreadable.push(label);
    } else if (verdict.state === "fine") {
      sorted.fine++;
    } else if (withDevice.has(member.id)) {
      sorted.willRemind.push({
        memberId: member.id,
        name: label,
        value: verdict.value,
      });
    } else {
      sorted.noDevice.push({ name: label, value: verdict.value });
    }
  }
  sorted.willRemind.sort(byName);
  sorted.noDevice.sort(byName);
  sorted.noRow.sort();
  sorted.unclear.sort();
  sorted.unreadable.sort();
  return sorted;
}

// ---------------------------------------------------------------------------------------
// Dues
// ---------------------------------------------------------------------------------------

export type Audience = {
  /** Owe money and have at least one device with notifications on. */
  willRemind: (ReminderPerson & { memberId: string })[];
  noDevice: ReminderPerson[];
  noRow: string[];
  unclear: string[];
  unreadable: string[];
  noName: number;
  paidUp: number;
};

/** Who owes dues (charged minus paid, never below zero). Null when no dues sheet is set up. */
export async function duesAudience(): Promise<Audience | null> {
  const source = await sourceOfKind("dues");
  if (!source) return null;
  const sorted = await sortMembers("dues", source, (cells) => {
    const charged = parseMoney(cells.charged);
    const paid = parseMoney(cells.paid);
    if (charged === null || paid === null) return { state: "unreadable" };
    const owes = Math.max(0, Math.round((charged - paid) * 100) / 100);
    return owes === 0 ? { state: "fine" } : { state: "remind", value: owes };
  });
  return {
    willRemind: sorted.willRemind.map(({ memberId, name, value }) => ({
      memberId,
      name,
      owes: value,
    })),
    noDevice: sorted.noDevice.map(({ name, value }) => ({ name, owes: value })),
    noRow: sorted.noRow,
    unclear: sorted.unclear,
    unreadable: sorted.unreadable,
    noName: sorted.noName,
    paidUp: sorted.fine,
  };
}

// ---------------------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------------------

export type RequirementsAudience = {
  /** The percentage a member needs, as officers set it on Dashboard setup. */
  threshold: number;
  /** Below the threshold and have at least one device with notifications on. */
  willRemind: (RequirementPerson & { memberId: string })[];
  noDevice: RequirementPerson[];
  noRow: string[];
  unclear: string[];
  unreadable: string[];
  noName: number;
  onTrack: number;
};

/** Who is below the requirements threshold. Null when no requirements sheet is set up. */
export async function requirementsAudience(): Promise<RequirementsAudience | null> {
  const source = await sourceOfKind("requirements");
  if (!source) return null;
  const threshold = source.threshold ?? DEFAULT_THRESHOLD;
  const sorted = await sortMembers("requirements", source, (cells) => {
    const percent = parsePercent(cells.percent);
    if (percent === null) return { state: "unreadable" };
    return percent >= threshold
      ? { state: "fine" }
      : { state: "remind", value: percent };
  });
  return {
    threshold,
    willRemind: sorted.willRemind.map(({ memberId, name, value }) => ({
      memberId,
      name,
      percent: value,
    })),
    noDevice: sorted.noDevice.map(({ name, value }) => ({
      name,
      percent: value,
    })),
    noRow: sorted.noRow,
    unclear: sorted.unclear,
    unreadable: sorted.unreadable,
    noName: sorted.noName,
    onTrack: sorted.fine,
  };
}

// ---------------------------------------------------------------------------------------
// The messages
// ---------------------------------------------------------------------------------------

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** 2026-12-01 -> "Dec 1". Plain text work, so no time zone can shift the day. */
export function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

/** 85 -> "$85", 85.5 -> "$85.50". */
export function dollars(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** What the member's lock screen shows for dues. */
export function reminderBody(owes: number, isoDueDate: string): string {
  return `You owe ${dollars(owes)} in dues, due ${shortDate(isoDueDate)}.`;
}

/** What the member's lock screen shows for requirements. */
export function requirementsBody(percent: number, threshold: number): string {
  return `You're not meeting requirements: ${percent}% (need ${threshold}%).`;
}
