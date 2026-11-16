// The dues reminder: who owes money, worked out from the dues sheet, and the message each of
// them gets. Both the officer's preview and the real send call duesAudience(), so the list the
// officer approves is made the same way as the list that is used. The send never trusts a list
// from the browser: it asks again here.
import type { ReminderPerson } from "@ttapp/shared";
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
  parseTable,
  readRows,
} from "./sheets.ts";

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

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/**
 * Reads the dues sheet and sorts every active member into: will be reminded, owes but has no
 * device, or can't be reminded (and why). Returns null when no dues sheet is set up. Throws
 * GoogleError when Google or the saved columns don't work, like the member's own dues card.
 */
export async function duesAudience(): Promise<Audience | null> {
  const [source] = await db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.kind, "dues"));
  if (!source || source.tabGid === null) return null;

  const table = parseTable(
    (await readRows(source.googleId, source.tabGid)).rows,
    "dues",
    source.columns ?? TEMPLATE_COLUMNS.dues,
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

  const audience: Audience = {
    willRemind: [],
    noDevice: [],
    noRow: [],
    unclear: [],
    unreadable: [],
    noName: 0,
    paidUp: 0,
  };
  for (const member of everyone) {
    // Matching by name needs a name; a member who never signed in has none yet.
    if (table.person === "name" && !member.name?.trim()) {
      audience.noName++;
      continue;
    }
    const label = member.name?.trim() || member.email;
    const match = matchMember(table, member, index);
    if (match.row === null) {
      (match.refused ? audience.unclear : audience.noRow).push(label);
      continue;
    }
    // The same person on two sheet rows is never guessed at.
    if (table.duplicates.has(match.row.key)) {
      audience.unclear.push(label);
      continue;
    }
    const charged = parseMoney(match.row.cells.charged);
    const paid = parseMoney(match.row.cells.paid);
    if (charged === null || paid === null) {
      audience.unreadable.push(label);
      continue;
    }
    const owes = Math.max(0, Math.round((charged - paid) * 100) / 100);
    if (owes === 0) {
      audience.paidUp++;
    } else if (withDevice.has(member.id)) {
      audience.willRemind.push({ memberId: member.id, name: label, owes });
    } else {
      audience.noDevice.push({ name: label, owes });
    }
  }
  audience.willRemind.sort(byName);
  audience.noDevice.sort(byName);
  audience.noRow.sort();
  audience.unclear.sort();
  audience.unreadable.sort();
  return audience;
}

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

/** What the member's lock screen shows. */
export function reminderBody(owes: number, isoDueDate: string): string {
  return `You owe ${dollars(owes)} in dues, due ${shortDate(isoDueDate)}.`;
}
