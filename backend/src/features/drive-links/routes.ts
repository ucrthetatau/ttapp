import type { DriveLink, DriveLinksResponse } from "@ttapp/shared";
import { eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireLogin } from "../../common/auth.ts";
import { db } from "../../common/db/client.ts";
import { ringLinks } from "../../common/doorbell.ts";
import { driveLinks } from "../../common/db/schema.ts";
import { requirePermission } from "../../common/permissions.ts";
import { validateBody } from "../../common/validate.ts";

export const driveLinksRouter = Router();

// GET /api/drive-links: the chapter's shared links, A to Z by label (capitals don't matter).
// Every member can read them; officers add and remove them.
driveLinksRouter.get(
  "/",
  requireLogin,
  requirePermission("driveLinks.view"),
  async (_req, res) => {
    const rows = await db
      .select({
        id: driveLinks.id,
        label: driveLinks.label,
        url: driveLinks.url,
      })
      .from(driveLinks)
      .orderBy(sql`lower(${driveLinks.label})`, driveLinks.createdAt);

    const body: DriveLinksResponse = { links: rows };
    res.json(body);
  },
);

// A label people recognize, and a web address that starts with https://. Anything else
// (http, javascript:, plain text) is refused, because these become buttons people tap.
// The address is saved exactly as entered, apart from spaces at either end. The database
// rule only accepts a lowercase "https://", so a capitalized scheme is refused, not rewritten.
const addLinkBody = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Enter a label")
    .max(80, "Keep the label to 80 characters or fewer"),
  url: z
    .string()
    .trim()
    .max(2000, "That web address is too long")
    .pipe(
      z.url({
        protocol: /^https$/,
        error: "Enter a web address that starts with https://",
      }),
    )
    .refine((url) => url.startsWith("https://"), {
      error: 'Start the address with "https://" in lowercase',
    }),
});

// POST /api/drive-links: adds a link. Officers and admins only (driveLinks.manage).
// The same address can be added twice under different labels.
driveLinksRouter.post(
  "/",
  requireLogin,
  requirePermission("driveLinks.manage"),
  validateBody(addLinkBody),
  async (req, res) => {
    const { label, url } = req.body as z.infer<typeof addLinkBody>;
    const [created] = await db
      .insert(driveLinks)
      .values({ label, url })
      .returning({
        id: driveLinks.id,
        label: driveLinks.label,
        url: driveLinks.url,
      });
    const body: DriveLink = created;
    res.status(201).json(body);
    void ringLinks("links-changed"); // never throws
  },
);

// DELETE /api/drive-links/:id: removes a link for good. Officers and admins only.
// Links have no history to keep, so this is a real delete.
driveLinksRouter.delete(
  "/:id",
  requireLogin,
  requirePermission("driveLinks.manage"),
  async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: "Link not found" });
      return;
    }
    const removed = await db
      .delete(driveLinks)
      .where(eq(driveLinks.id, id.data))
      .returning({ id: driveLinks.id });
    if (removed.length === 0) {
      res.status(404).json({ error: "Link not found" });
      return;
    }
    res.status(204).end();
    void ringLinks("links-changed");
  },
);
