import type { EditPostResponse, PostRsvpsResponse } from "@ttapp/shared";
import { readError } from "../common/readError.ts";

export type ApiResult<T = Record<never, never>> =
  ({ ok: true } & T) | { ok: false; message: string };

// Sends one request and turns every failure (a refusal from the backend, or no connection
// at all) into a message the page can show. The backend's own wording is used when it
// gave one, so the rules live in one place.
async function call(
  url: string,
  init?: RequestInit,
): Promise<ApiResult<{ res: Response }>> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true, res };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

// POST /api/posts. The backend trims both texts, requires the title, and checks the lengths.
export async function createPost(
  title: string,
  body: string,
  hasRsvp: boolean,
): Promise<ApiResult> {
  const result = await call("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, hasRsvp }),
  });
  return result.ok ? { ok: true } : result;
}

// DELETE /api/posts/:id.
export async function deletePost(id: string): Promise<ApiResult> {
  const result = await call(`/api/posts/${id}`, { method: "DELETE" });
  return result.ok ? { ok: true } : result;
}

// Yes is true, No is false, and null takes your answer back.
export async function setRsvp(
  id: string,
  answer: boolean | null,
): Promise<ApiResult> {
  const result =
    answer === null
      ? await call(`/api/posts/${id}/rsvp`, { method: "DELETE" })
      : await call(`/api/posts/${id}/rsvp`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer }),
        });
  return result.ok ? { ok: true } : result;
}

// GET /api/posts/:id/rsvps: the names behind the counts.
export async function getRsvps(
  id: string,
): Promise<ApiResult<{ rsvps: PostRsvpsResponse }>> {
  const result = await call(`/api/posts/${id}/rsvps`);
  if (!result.ok) return result;
  return { ok: true, rsvps: (await result.res.json()) as PostRsvpsResponse };
}

// PATCH /api/posts/:id: rewrites your own post. The backend trims the text and answers with
// what it saved and when the post counts as edited (unchanged text is not an edit).
export async function editPost(
  id: string,
  title: string,
  body: string,
): Promise<ApiResult<{ edit: EditPostResponse }>> {
  const result = await call(`/api/posts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!result.ok) return result;
  return { ok: true, edit: (await result.res.json()) as EditPostResponse };
}
