import type {
  DashboardEvent,
  DashboardEventsResponse,
  DashboardSource,
  DashboardSourcesResponse,
  InspectSheetResponse,
  MyDuesResponse,
  MyRequirementsResponse,
  RemindersPreviewResponse,
  SaveSourceResponse,
  SendRemindersResponse,
  SheetTabsResponse,
  TestReminderResponse,
} from "@ttapp/shared";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import {
  dashboardSources,
  duesReminderSends,
  members,
} from "../../common/db/schema.ts";
import { requirePermission } from "../../common/permissions.ts";
import { pushPublicKey, pushToMember } from "../../common/push.ts";
import { validateBody } from "../../common/validate.ts";
import { SHOWN_EVENTS, checkCalendar, readCalendar } from "./calendar.ts";
import { duesAudience, reminderBody } from "./reminders.ts";
import {
  GoogleError,
  clearGoogleCache,
  serviceAccountEmail,
} from "./google.ts";
import {
  ROLES,
  TEMPLATE_COLUMNS,
  blockingProblems,
  buildReport,
  candidates,
  findOwnRow,
  listTabs,
  parseMoney,
  parsePercent,
  parseSheetLink,
  parseTable,
  readRows,
  readTabFresh,
  sheetUrl,
  suggest,
} from "./sheets.ts";
import type { Columns, SheetKind } from "./sheets.ts";

export const dashboardRouter = Router();

const MAX_CALENDARS = 10;
const DEFAULT_THRESHOLD = 80;

// Google problems become a clear message for the one card or form that asked, never a crash.
// "Couldn't read this" is 502 (the gateway between us and Google failed), like the ticket says.
function answerGoogleError(res: Response, error: unknown): void {
  if (error instanceof GoogleError) {
    res.status(502).json({ error: error.message });
    return;
  }
  throw error;
}

type SourceRow = typeof dashboardSources.$inferSelect;

function toSource(row: SourceRow): DashboardSource {
  return {
    id: row.id,
    kind: row.kind as DashboardSource["kind"],
    label: row.label,
    url: row.tabGid === null ? null : sheetUrl(row.googleId, row.tabGid),
    threshold: row.threshold,
    columns: row.columns,
    tabGid: row.tabGid,
  };
}

async function sourceOfKind(kind: SheetKind): Promise<SourceRow | undefined> {
  const [row] = await db
    .select()
    .from(dashboardSources)
    .where(eq(dashboardSources.kind, kind));
  return row;
}

// The columns saved for a sheet, or the template's header names for an older row.
const columnsOf = (row: SourceRow, kind: SheetKind): Columns =>
  row.columns ?? TEMPLATE_COLUMNS[kind];

type ActiveMember = { email: string; name: string | null };

async function activeMembers(): Promise<ActiveMember[]> {
  return db
    .select({ email: members.email, name: members.name })
    .from(members)
    .where(isNull(members.removedAt));
}

// ---------------------------------------------------------------------------------------
// What members see
// ---------------------------------------------------------------------------------------

// GET /api/dashboard/events: the next three events across all the chapter's calendars.
// A calendar that can't be read is listed in "failed"; the others still show.
dashboardRouter.get(
  "/events",
  requireLogin,
  requirePermission("dashboard.view"),
  async (_req, res) => {
    const calendars = await db
      .select()
      .from(dashboardSources)
      .where(eq(dashboardSources.kind, "calendar"));

    const results = await Promise.allSettled(
      calendars.map((calendar) => readCalendar(calendar.googleId)),
    );
    const events: DashboardEvent[] = [];
    const failed: string[] = [];
    results.forEach((result, index) => {
      const label = calendars[index].label;
      if (result.status === "rejected") {
        failed.push(label);
        return;
      }
      for (const event of result.value.events) {
        events.push({ ...event, calendar: label });
      }
    });
    events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

    const body: DashboardEventsResponse = {
      events: events.slice(0, SHOWN_EVENTS),
      failed,
    };
    // Every calendar failing is a failure of the card; a partial answer is not.
    if (calendars.length > 0 && failed.length === calendars.length) {
      res.status(502).json({ error: "Couldn't load the calendars" });
      return;
    }
    res.json(body);
  },
);

// Finds the signed-in member's own row in a source's sheet. Who is asking comes from the
// session, never from the request, so nobody can ask for another row. Returns undefined
// after answering (not set up).
async function ownRow(
  req: Parameters<Parameters<typeof dashboardRouter.get>[1]>[0],
  kind: SheetKind,
) {
  const me = req.auth?.member;
  const source = await sourceOfKind(kind);
  if (!me || !source || source.tabGid === null)
    return { source: null } as const;

  const columns = columnsOf(source, kind);
  const table = parseTable(
    (await readRows(source.googleId, source.tabGid)).rows,
    kind,
    columns,
  );
  const row = findOwnRow(table, me, await activeMembers());
  return { source, row } as const;
}

// GET /api/dashboard/me/dues: the signed-in member's OWN row.
dashboardRouter.get(
  "/me/dues",
  requireLogin,
  requirePermission("dashboard.view"),
  async (req, res) => {
    try {
      const found = await ownRow(req, "dues");
      if (!found.source || found.source.tabGid === null) {
        const body: MyDuesResponse = { configured: false };
        res.json(body);
        return;
      }
      const link = sheetUrl(found.source.googleId, found.source.tabGid);
      if (!found.row) {
        const body: MyDuesResponse = {
          configured: true,
          found: false,
          sheetUrl: link,
        };
        res.json(body);
        return;
      }
      const charged = parseMoney(found.row.cells.charged);
      const paid = parseMoney(found.row.cells.paid);
      if (charged === null || paid === null) {
        throw new GoogleError(
          "Your row has a value the app can't read. Ask an officer",
          "failed",
        );
      }
      const body: MyDuesResponse = {
        configured: true,
        found: true,
        status: found.row.cells.status.trim(),
        charged,
        paid,
        stillToPay: Math.max(0, Math.round((charged - paid) * 100) / 100),
        sheetUrl: link,
      };
      res.json(body);
    } catch (error) {
      answerGoogleError(res, error);
    }
  },
);

// GET /api/dashboard/me/requirements: the signed-in member's own percentage and whether it
// reaches the threshold officers set. Same rule: only their own row.
dashboardRouter.get(
  "/me/requirements",
  requireLogin,
  requirePermission("dashboard.view"),
  async (req, res) => {
    try {
      const found = await ownRow(req, "requirements");
      if (!found.source || found.source.tabGid === null) {
        const body: MyRequirementsResponse = { configured: false };
        res.json(body);
        return;
      }
      const link = sheetUrl(found.source.googleId, found.source.tabGid);
      if (!found.row) {
        const body: MyRequirementsResponse = {
          configured: true,
          found: false,
          sheetUrl: link,
        };
        res.json(body);
        return;
      }
      const percent = parsePercent(found.row.cells.percent);
      if (percent === null) {
        throw new GoogleError(
          "Your percentage isn't filled in yet. Ask an officer",
          "failed",
        );
      }
      const threshold = found.source.threshold ?? DEFAULT_THRESHOLD;
      const body: MyRequirementsResponse = {
        configured: true,
        found: true,
        percent,
        threshold,
        onTrack: percent >= threshold,
        sheetUrl: link,
      };
      res.json(body);
    } catch (error) {
      answerGoogleError(res, error);
    }
  },
);

// ---------------------------------------------------------------------------------------
// What officers manage
// ---------------------------------------------------------------------------------------

const manage = [requireLogin, requirePermission("dashboard.manage")];

// GET /api/dashboard/sources: what the dashboard reads from now, plus the address to share
// new sheets and calendars with.
dashboardRouter.get("/sources", ...manage, async (_req, res) => {
  const rows = await db
    .select()
    .from(dashboardSources)
    .orderBy(asc(dashboardSources.kind), asc(dashboardSources.createdAt));
  const body: DashboardSourcesResponse = {
    sources: rows.map(toSource),
    serviceAccountEmail: serviceAccountEmail(),
  };
  res.json(body);
});

const sheetKind = z.enum(["dues", "requirements"]);

const inspectBody = z.object({
  kind: sheetKind,
  link: z.string().trim().min(1, "Paste the link").max(2000),
});

// POST /api/dashboard/sources/inspect: reads the top of a tab and says which header cells can
// be picked, with a best guess for each column. Nothing is saved, and no member rows are sent
// back: only header cells above the first row of data.
dashboardRouter.post(
  "/sources/inspect",
  ...manage,
  validateBody(inspectBody),
  async (req, res) => {
    const { kind, link } = req.body as z.infer<typeof inspectBody>;
    const parsed = parseSheetLink(link);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const { tabName, rows } = await readTabFresh(parsed.id, parsed.gid);
      const list = candidates(rows);
      const body: InspectSheetResponse = {
        tabName,
        roles: ROLES[kind],
        candidates: list,
        suggestions: suggest(kind, list),
      };
      res.json(body);
    } catch (error) {
      answerGoogleError(res, error);
    }
  },
);

// The header text chosen for each column. Any role not listed for the kind is refused.
const columnsSchema = (kind: SheetKind) =>
  z.strictObject(
    Object.fromEntries(
      ROLES[kind].map(({ role }) => [
        role,
        z.string().trim().min(1, "Choose every column").max(200),
      ]),
    ),
  );

const sheetBody = z.object({
  link: z.string().trim().min(1, "Paste the link").max(2000),
  columns: z.record(z.string(), z.string()),
  threshold: z.number().int().min(0).max(100).optional(),
});

// PUT /api/dashboard/sources/:kind (dues or requirements): points the dashboard at a sheet tab
// with the chosen columns. The tab is read and checked BEFORE anything is saved, so a wrong
// link or a missing column changes nothing. The old source is replaced.
dashboardRouter.put(
  "/sources/:kind",
  ...manage,
  validateBody(sheetBody),
  async (req, res) => {
    const kind = sheetKind.safeParse(req.params.kind);
    if (!kind.success) {
      res.status(404).json({ error: "Unknown kind" });
      return;
    }
    const { link, columns, threshold } = req.body as z.infer<typeof sheetBody>;
    const parsedColumns = columnsSchema(kind.data).safeParse(columns);
    if (!parsedColumns.success) {
      res.status(400).json({
        error: "Choose every column",
        problems: parsedColumns.error.issues.map((i) => i.message),
      });
      return;
    }
    const parsed = parseSheetLink(link);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const { tabName, rows } = await readTabFresh(parsed.id, parsed.gid);
      const chosen: Columns = parsedColumns.data;
      const table = parseTable(rows, kind.data, chosen);
      const problems = blockingProblems(table);
      if (problems.length > 0) {
        res.status(400).json({
          error:
            "This sheet doesn't fit the chosen columns, so nothing was saved",
          problems: problems.slice(0, 20),
        });
        return;
      }
      const report = buildReport(
        table,
        kind.data,
        tabName,
        await activeMembers(),
      );

      const existing = await sourceOfKind(kind.data);
      const saved = await db.transaction(async (tx) => {
        await tx
          .delete(dashboardSources)
          .where(eq(dashboardSources.kind, kind.data));
        const [row] = await tx
          .insert(dashboardSources)
          .values({
            kind: kind.data,
            label: tabName,
            googleId: parsed.id,
            tabGid: parsed.gid,
            columns: chosen,
            threshold:
              kind.data === "requirements"
                ? (threshold ?? existing?.threshold ?? DEFAULT_THRESHOLD)
                : null,
          })
          .returning();
        return row;
      });
      clearGoogleCache();
      const body: SaveSourceResponse = { source: toSource(saved), report };
      res.json(body);
    } catch (error) {
      answerGoogleError(res, error);
    }
  },
);

// GET /api/dashboard/sources/:kind/tabs: every tab of the saved file, so officers can pick the
// new quarter's tab from a list instead of pasting a link again. Read fresh from Google (not
// the shared one-minute copy), so a tab the treasurer just added shows up at once.
dashboardRouter.get("/sources/:kind/tabs", ...manage, async (req, res) => {
  const kind = sheetKind.safeParse(req.params.kind);
  if (!kind.success) {
    res.status(404).json({ error: "Unknown kind" });
    return;
  }
  const source = await sourceOfKind(kind.data);
  if (!source) {
    res.status(404).json({ error: "No sheet is set yet" });
    return;
  }
  try {
    const tabs = await listTabs(source.googleId);
    const body: SheetTabsResponse = {
      tabs,
      currentGid: tabs.some((t) => t.gid === source.tabGid)
        ? source.tabGid
        : null,
    };
    res.json(body);
  } catch (error) {
    answerGoogleError(res, error);
  }
});

const tabBody = z.object({ gid: z.number().int().min(0).max(2_147_483_647) });

// PUT /api/dashboard/sources/:kind/tab: moves the dashboard to another tab of the SAME file,
// keeping the columns already chosen (they are looked up by header text, so a new quarter's tab
// with the same headers just works). Like saving a link, the new tab is read and checked
// BEFORE anything changes: if its headers don't fit, or a name is on two rows, nothing is
// saved and the officer is told what is wrong.
dashboardRouter.put(
  "/sources/:kind/tab",
  ...manage,
  validateBody(tabBody),
  async (req, res) => {
    const kind = sheetKind.safeParse(req.params.kind);
    if (!kind.success) {
      res.status(404).json({ error: "Unknown kind" });
      return;
    }
    const { gid } = req.body as z.infer<typeof tabBody>;
    const source = await sourceOfKind(kind.data);
    if (!source) {
      res.status(404).json({ error: "No sheet is set yet" });
      return;
    }
    try {
      const { tabName, rows } = await readTabFresh(source.googleId, gid);
      const table = parseTable(rows, kind.data, columnsOf(source, kind.data));
      const problems = blockingProblems(table);
      if (problems.length > 0) {
        res.status(400).json({
          error: `“${tabName}” doesn't fit the chosen columns, so nothing was changed`,
          problems: problems.slice(0, 20),
        });
        return;
      }
      const report = buildReport(
        table,
        kind.data,
        tabName,
        await activeMembers(),
      );
      const [row] = await db
        .update(dashboardSources)
        .set({ tabGid: gid, label: tabName })
        .where(eq(dashboardSources.id, source.id))
        .returning();
      clearGoogleCache();
      const body: SaveSourceResponse = { source: toSource(row), report };
      res.json(body);
    } catch (error) {
      answerGoogleError(res, error);
    }
  },
);

const thresholdBody = z.object({
  threshold: z.number().int().min(0).max(100),
});

// PATCH /api/dashboard/sources/requirements/threshold: changes only the percentage that
// counts as "on track".
dashboardRouter.patch(
  "/sources/requirements/threshold",
  ...manage,
  validateBody(thresholdBody),
  async (req, res) => {
    const { threshold } = req.body as z.infer<typeof thresholdBody>;
    const updated = await db
      .update(dashboardSources)
      .set({ threshold })
      .where(eq(dashboardSources.kind, "requirements"))
      .returning({ id: dashboardSources.id });
    if (updated.length === 0) {
      res.status(404).json({ error: "No requirements sheet is set yet" });
      return;
    }
    res.status(204).end();
  },
);

const calendarBody = z.object({
  label: z.string().trim().min(1, "Enter a label").max(40),
  calendarId: z
    .string()
    .trim()
    .min(1, "Paste the calendar ID")
    .max(300)
    .regex(/^[^\s/?#]+$/, "That doesn't look like a calendar ID"),
});

// POST /api/dashboard/sources/calendars: adds a calendar. It is read first (one event), so a
// calendar that isn't shared with the service account is refused with a clear message.
dashboardRouter.post(
  "/sources/calendars",
  ...manage,
  validateBody(calendarBody),
  async (req, res) => {
    const { label, calendarId } = req.body as z.infer<typeof calendarBody>;

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(dashboardSources)
      .where(eq(dashboardSources.kind, "calendar"));
    if (total >= MAX_CALENDARS) {
      res.status(409).json({
        error: `At most ${MAX_CALENDARS} calendars. Remove one first`,
      });
      return;
    }
    const [dupe] = await db
      .select({ id: dashboardSources.id })
      .from(dashboardSources)
      .where(
        and(
          eq(dashboardSources.kind, "calendar"),
          eq(dashboardSources.googleId, calendarId),
        ),
      );
    if (dupe) {
      res.status(409).json({ error: "That calendar is already added" });
      return;
    }

    try {
      const read = await checkCalendar(calendarId);
      const [row] = await db
        .insert(dashboardSources)
        .values({ kind: "calendar", label, googleId: calendarId })
        .returning();
      clearGoogleCache();
      const body: SaveSourceResponse = {
        source: toSource(row),
        report: {
          name: read.name,
          rows: null,
          matched: null,
          matchBy: null,
          unmatched: [],
          membersWithoutRow: null,
          membersWithoutName: null,
          looseMatches: [],
          ambiguousMembers: null,
          preview: [],
          previewHeaders: [],
          warnings: [],
        },
      };
      res.status(201).json(body);
    } catch (error) {
      answerGoogleError(res, error);
    }
  },
);

// DELETE /api/dashboard/sources/:id: stops reading from a sheet or calendar. Nothing in
// Google changes.
dashboardRouter.delete("/sources/:id", ...manage, async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  const removed = await db
    .delete(dashboardSources)
    .where(eq(dashboardSources.id, id.data))
    .returning({ id: dashboardSources.id });
  if (removed.length === 0) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  clearGoogleCache();
  res.status(204).end();
});

// ---------------------------------------------------------------------------------------
// Dues reminder: one push to everyone who still owes
// ---------------------------------------------------------------------------------------

// GET /api/dashboard/reminders: who a reminder would reach, and who it can't (and why), plus
// the last time one was sent. Officers see names and amounts here; nothing is sent.
dashboardRouter.get("/reminders", ...manage, async (_req, res) => {
  try {
    const audience = await duesAudience();
    if (!audience) {
      const body: RemindersPreviewResponse = { configured: false };
      res.json(body);
      return;
    }
    const [last] = await db
      .select({
        sentAt: duesReminderSends.createdAt,
        sentBy: members.name,
        dueDate: duesReminderSends.dueDate,
        reminded: duesReminderSends.reminded,
      })
      .from(duesReminderSends)
      .leftJoin(members, eq(members.id, duesReminderSends.sentBy))
      .orderBy(desc(duesReminderSends.createdAt))
      .limit(1);

    const body: RemindersPreviewResponse = {
      configured: true,
      willRemind: audience.willRemind.map(({ name, owes }) => ({ name, owes })),
      noDevice: audience.noDevice,
      noRow: audience.noRow,
      unclear: audience.unclear,
      unreadable: audience.unreadable,
      noName: audience.noName,
      paidUp: audience.paidUp,
      last: last ? { ...last, sentAt: last.sentAt.toISOString() } : null,
    };
    res.json(body);
  } catch (error) {
    answerGoogleError(res, error);
  }
});

const remindBody = z.object({
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the due date")
    .refine((text) => {
      // Reject 2026-02-31 and the like: the date must survive a round trip.
      const parsed = new Date(`${text}T00:00:00Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === text
      );
    }, "That date doesn't exist"),
});

// While one send is running a second press is refused, so a double tap or two officers
// pressing at once cannot notify everyone twice. (There is no waiting period afterwards: the
// officer chose not to have one.) One backend process, so a flag in memory is enough.
let sending = false;

// POST /api/dashboard/reminders/send: sends each member who owes money their own message.
// The list is worked out again here from the sheet, never taken from the request, so the only
// thing the officer chooses is the due date.
dashboardRouter.post(
  "/reminders/send",
  ...manage,
  validateBody(remindBody),
  async (req, res) => {
    const { dueDate } = req.body as z.infer<typeof remindBody>;
    if (!pushPublicKey()) {
      res
        .status(503)
        .json({ error: "Notifications aren't set up on the server yet" });
      return;
    }
    if (sending) {
      res.status(409).json({ error: "A reminder is already being sent" });
      return;
    }
    sending = true;
    try {
      const audience = await duesAudience();
      if (!audience) {
        res.status(404).json({ error: "No dues sheet is set yet" });
        return;
      }
      if (audience.willRemind.length === 0) {
        res
          .status(409)
          .json({ error: "Nobody with notifications on owes dues" });
        return;
      }

      const results = await Promise.all(
        audience.willRemind.map(async (person) => ({
          person,
          devices: await pushToMember(person.memberId, {
            title: "Dues reminder",
            body: reminderBody(person.owes, dueDate),
            url: "/",
            tag: "dues-reminder",
          }),
        })),
      );
      const reminded = results.filter((r) => r.devices > 0).length;
      await db.insert(duesReminderSends).values({
        sentBy: req.auth!.member.id,
        dueDate,
        reminded,
      });
      const body: SendRemindersResponse = {
        reminded,
        notDelivered: results
          .filter((r) => r.devices === 0)
          .map((r) => r.person.name),
      };
      res.json(body);
    } catch (error) {
      answerGoogleError(res, error);
    } finally {
      sending = false;
    }
  },
);

// What a test shows when the officer owes nothing, so there is still something to look at.
const SAMPLE_AMOUNT = 25;

// POST /api/dashboard/reminders/test: the same notification, sent ONLY to the officer who
// pressed it, on their own devices. It exists so the real thing can be checked on a real phone
// without notifying the chapter. It uses the officer's own amount from the sheet when they
// owe something, a sample otherwise, says "(test)" in the title, and is not logged, so "Last
// sent" only ever shows real sends. It does not use the "sending" flag: it can't reach anyone
// else.
dashboardRouter.post(
  "/reminders/test",
  ...manage,
  validateBody(remindBody),
  async (req, res) => {
    const { dueDate } = req.body as z.infer<typeof remindBody>;
    if (!pushPublicKey()) {
      res
        .status(503)
        .json({ error: "Notifications aren't set up on the server yet" });
      return;
    }
    const me = req.auth!.member;

    // The officer's real amount if they appear in the "will be reminded" list; a sheet that
    // can't be read is no reason to refuse a test, so that falls back to the sample too.
    let own: number | undefined;
    try {
      own = (await duesAudience())?.willRemind.find(
        (person) => person.memberId === me.id,
      )?.owes;
    } catch (error) {
      if (!(error instanceof GoogleError)) throw error;
    }

    const devices = await pushToMember(me.id, {
      title: "Dues reminder (test)",
      body: reminderBody(own ?? SAMPLE_AMOUNT, dueDate),
      url: "/",
      tag: "dues-reminder-test",
    });
    if (devices === 0) {
      res.status(409).json({
        error:
          "None of your devices has notifications on. Turn them on in the menu first",
      });
      return;
    }
    const body: TestReminderResponse = {
      devices,
      usedSample: own === undefined,
    };
    res.json(body);
  },
);
