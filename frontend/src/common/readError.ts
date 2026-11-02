// The backend answers errors as { error } or, for bad input, { error, problems: [...] }.
// This picks the most specific message to show. Every feature's api file uses it, so it
// lives in common/ and features never import from each other.
export async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: string;
      problems?: { message: string }[];
    };
    return body.problems?.[0]?.message ?? body.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}
