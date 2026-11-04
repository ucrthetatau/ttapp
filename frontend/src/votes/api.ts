import type {
  CloseVoteResponse,
  HeadcountResponse,
  OpenVoteResponse,
  VoteDetailsResponse,
  VoteKind,
} from "@ttapp/shared";
import { readError } from "../common/readError.ts";

export type Result<T = Record<never, never>> =
  ({ ok: true } & T) | { ok: false; message: string; status?: number };

// Sends one request and turns every failure (a refusal from the backend, or no connection at
// all) into a message the page can show. The backend's own wording is used when it gave one,
// so the rules live in one place and are never repeated here.
async function call(
  url: string,
  init?: RequestInit,
): Promise<Result<{ res: Response }>> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      return { ok: false, message: await readError(res), status: res.status };
    }
    return { ok: true, res };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// PUT /api/votes/current/answer: yes is true, no is false. Sending again changes your answer
// while the vote is open. The backend decides who may answer (not the Regent, not members an
// officer switched off) and answers with a message when it refuses.
export async function answerVote(answer: boolean): Promise<Result> {
  const result = await call(
    "/api/votes/current/answer",
    json("PUT", { answer }),
  );
  return result.ok ? { ok: true } : result;
}

// PUT /api/votes/headcount: how many members are present. Can be changed any time; an open
// vote follows the new number.
export async function setHeadcount(
  presentCount: number,
): Promise<Result<{ headcount: HeadcountResponse }>> {
  const result = await call(
    "/api/votes/headcount",
    json("PUT", { presentCount }),
  );
  if (!result.ok) return result;
  return {
    ok: true,
    headcount: (await result.res.json()) as HeadcountResponse,
  };
}

// POST /api/votes: the Regent opens a vote of a kind. The backend refuses (409) until a
// headcount is set, and while another vote is open.
export async function openVote(
  title: string,
  kind: VoteKind,
): Promise<Result<{ id: string }>> {
  const result = await call("/api/votes", json("POST", { title, kind }));
  if (!result.ok) return result;
  return { ok: true, id: ((await result.res.json()) as OpenVoteResponse).id };
}

export type CloseResult =
  | { ok: true; result: "pass" | "fail" }
  // tie: a majority vote came out exactly even, so the Regent has to choose yes or no.
  | { ok: false; message: string; tie: boolean };

// POST /api/votes/:id/close. On a tie the backend answers 409 with tie: true, and the Regent
// closes again with their choice.
export async function closeVote(
  id: string,
  tiebreak?: "yes" | "no",
): Promise<CloseResult> {
  try {
    const res = await fetch(
      `/api/votes/${id}/close`,
      json("POST", tiebreak ? { tiebreak } : {}),
    );
    if (res.ok) {
      return {
        ok: true,
        result: ((await res.json()) as CloseVoteResponse).result,
      };
    }
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      tie?: boolean;
    } | null;
    return {
      ok: false,
      message: body?.error ?? "Something went wrong.",
      tie: body?.tie === true,
    };
  } catch {
    return { ok: false, message: "Can't reach the server.", tie: false };
  }
}

// DELETE /api/votes/:id: removes the vote and all its answers. This is how a vote is redone.
export async function deleteVote(id: string): Promise<Result> {
  const result = await call(`/api/votes/${id}`, { method: "DELETE" });
  return result.ok ? { ok: true } : result;
}

// GET /api/votes/:id/details: the Regent's private view of a closed vote.
export async function getDetails(
  id: string,
): Promise<Result<{ details: VoteDetailsResponse }>> {
  const result = await call(`/api/votes/${id}/details`);
  if (!result.ok) return result;
  return {
    ok: true,
    details: (await result.res.json()) as VoteDetailsResponse,
  };
}
