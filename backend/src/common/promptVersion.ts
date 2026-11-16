// The version of the "turn on notifications" pop-up (see the notification_prompt table). Read on
// every sign-in check (/api/auth/me) so each phone can compare it with what it has already
// shown. A missing row, or a database hiccup, means version 1: the pop-up then behaves exactly as
// it did before versions existed.
import { db } from "./db/client.ts";
import { notificationPrompt } from "./db/schema.ts";

export async function readPromptVersion(): Promise<number> {
  try {
    const [row] = await db.select().from(notificationPrompt);
    return row?.version ?? 1;
  } catch (error) {
    console.error("Could not read the notification pop-up version", error);
    return 1;
  }
}
