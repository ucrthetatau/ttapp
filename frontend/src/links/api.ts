import type { DriveLink } from "@ttapp/shared";
import { readError } from "../common/readError.ts";

export type AddLinkResult =
  { ok: true; link: DriveLink } | { ok: false; message: string };

// POST /api/drive-links. The backend trims the label, checks the address, and saves the
// address exactly as typed.
export async function addLink(
  label: string,
  url: string,
): Promise<AddLinkResult> {
  try {
    const res = await fetch("/api/drive-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, url }),
    });
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true, link: (await res.json()) as DriveLink };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

export type RemoveLinkResult = { ok: true } | { ok: false; message: string };

// DELETE /api/drive-links/:id.
export async function removeLink(id: string): Promise<RemoveLinkResult> {
  try {
    const res = await fetch(`/api/drive-links/${id}`, { method: "DELETE" });
    if (res.ok) return { ok: true };
    return { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}
