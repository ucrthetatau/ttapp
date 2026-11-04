import { readError } from "../common/readError.ts";

export type AnswerResult = { ok: true } | { ok: false; message: string };

// PUT /api/votes/current/answer: yes is true, no is false. Sending again changes your answer
// while the vote is open. The backend decides who may answer (not the Regent, not members an
// officer switched off) and answers with a message when it refuses.
export async function answerVote(answer: boolean): Promise<AnswerResult> {
  try {
    const res = await fetch("/api/votes/current/answer", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: "Can't reach the server." };
  }
}
