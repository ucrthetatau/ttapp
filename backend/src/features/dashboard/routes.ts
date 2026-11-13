import type {
  DashboardEvent,
  DashboardEventsResponse,
  DashboardSource,
  DashboardSourcesResponse,
  InspectSheetResponse,
  MyDuesResponse,
  MyRequirementsResponse,
  SaveSourceResponse,
} from "@ttapp/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import { dashboardSources, members } from "../../common/db/schema.ts";
import { requirePermission } from "../../common/permissions.ts";
import { validateBody } from "../../common/validate.ts";
import { checkCalendar, readCalendar } from "./calendar.ts";
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
const SHOWN_EVENTS = 2;

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

// GET /api/dashboard/events: the next two events across all the chapter's calendars.
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
      if (!found.source) {
        const body: MyDuesResponse = { configured: false };
        res.json(body);
        return;
      }
      if (!found.row) {
        const body: MyDuesResponse = { configured: true, found: false };
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
