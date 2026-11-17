// The voting rules from the chapter bylaws, in one place so the backend and the frontend can
// never disagree. The backend uses decide() to count and enforce. The frontend uses
// yesNeeded() only to DISPLAY "needs N yeses"; it never decides anything.
//
// Every percentage is of the members COUNTED: the headcount the president sets (present) minus
// the abstainers the president says are sitting this vote out (stepped out, not following).
// Abstainers are a plain number, not named people, and they only change the percentages: they
// are still in the room. Quorum is not checked by the app (the Scribe does that). Anyone counted
// who has not said yes counts as no, so a vote can be closed before everyone has answered.
// All the math is whole numbers, so there is no rounding to go wrong. "At least 75% of 10"
// is worked out as: the smallest whole number of yeses that is not below 7.5, which is 8.

export const VOTE_KINDS = [
  "majority",
  "discussion",
  "midway",
  "overturn_midway",
  "final",
  "overturn_final",
] as const;

export type VoteKind = (typeof VOTE_KINDS)[number];

type Rule =
  | { type: "moreThanHalf" } // yes must be strictly more than half
  | { type: "atLeast"; percent: number } // yes must be at least this percent
  | { type: "atLeastPlusOne"; percent: number }; // ...and one more yes on top

type KindInfo = {
  label: string;
  rule: Rule;
  /** The percentage stored on the vote, so an old vote still shows what it needed. */
  percent: number;
};

export const VOTE_KIND_INFO: Record<VoteKind, KindInfo> = {
  // Simple majority: elections, dues changes, the rush interview invite.
  majority: {
    label: "Majority",
    rule: { type: "moreThanHalf" },
    percent: 50,
  },
  // Art V Section II.4 / Art VII Section III.4.e.i: reopen discussion on a decision.
  discussion: {
    label: "Open a discussion to overturn",
    rule: { type: "atLeast", percent: 60 },
    percent: 60,
  },
  // Art VII Section III.4.c: continue the pledging process.
  midway: {
    label: "Midway",
    rule: { type: "atLeast", percent: 75 },
    percent: 75,
  },
  // Art VII Section III.4.e.ii: overturn a midway result.
  overturn_midway: {
    label: "Overturn a midway",
    rule: { type: "atLeast", percent: 85 },
    percent: 85,
  },
  // Art VII Section III.4.d: be initiated.
  final: {
    label: "Final",
    rule: { type: "atLeast", percent: 90 },
    percent: 90,
  },
  // Art VII Section III.4.e.iii: "90% +1". Read as 90% of those present, plus one more yes
  // (the dismissal appeal rule in Section III.5.b uses "+1" the same way). In a very small
  // room that number is higher than the room, so it can never pass.
  overturn_final: {
    label: "Overturn a final",
    rule: { type: "atLeastPlusOne", percent: 90 },
    percent: 90,
  },
};

export function isVoteKind(value: unknown): value is VoteKind {
  return (
    typeof value === "string" &&
    (VOTE_KINDS as readonly string[]).includes(value)
  );
}

// Smallest whole number that is at least percent% of present (rounds up, no decimals).
function ceilPercent(percent: number, present: number): number {
  return Math.floor((percent * present + 99) / 100);
}

/** How many yeses this kind needs when `present` members are present. */
export function yesNeeded(kind: VoteKind, present: number): number {
  const rule = VOTE_KIND_INFO[kind].rule;
  switch (rule.type) {
    case "moreThanHalf":
      return Math.floor(present / 2) + 1;
    case "atLeast":
      return ceilPercent(rule.percent, present);
    case "atLeastPlusOne":
      return ceilPercent(rule.percent, present) + 1;
  }
}

/** The number a vote's percentages are measured against: present minus abstainers. */
export function countedFor(present: number, abstained: number): number {
  return present - abstained;
}

/** False when the number of yeses needed is bigger than the room, so the vote cannot pass. */
export function canPass(kind: VoteKind, present: number): boolean {
  return present >= 1 && yesNeeded(kind, present) <= present;
}

export type Decision = "pass" | "fail" | "tie";

/**
 * The result of a vote, given the yes answers and the number COUNTED (present minus
 * abstainers; a counted member who has not answered counts as no). "tie" only happens for majority, when yes is exactly half: the Regent breaks
 * it (bylaws Art V Section II.3). For every other kind an even split fails anyway.
 */
export function decide(kind: VoteKind, yes: number, counted: number): Decision {
  if (counted < 1) return "fail";
  if (kind === "majority" && yes * 2 === counted) return "tie";
  return yes >= yesNeeded(kind, counted) ? "pass" : "fail";
}

/** Plain-language working for the "info" button. Built from the same numbers decide() uses. */
export type Explanation = {
  /** The bylaw rule in words. */
  rule: string;
  /** The arithmetic for this many present. */
  working: string;
  /** How many yeses that comes to, or that the vote cannot pass in this room. */
  needed: string;
  /** What happened, once there is a result to explain (null while the vote is open). */
  outcome: string | null;
};

const RULE_TEXT: Record<VoteKind, string> = {
  majority: "More than half of those present must vote yes.",
  discussion: "At least 60% of those present must vote yes.",
  midway: "At least 75% of those present must vote yes.",
  overturn_midway: "At least 85% of those present must vote yes.",
  final: "At least 90% of those present must vote yes.",
  overturn_final:
    "At least 90% of those present must vote yes, plus one more yes on top.",
};

/**
 * Explains a vote's math. `yes` is the number of yes answers, once the vote has closed
 * (leave it out to explain only what is needed). `tiebreak` is the Regent's choice when a
 * majority vote was tied. `abstained` is how many were not counted (default none). The needed number always comes from yesNeeded(), never recomputed,
 * so what the screen says and what the server counts cannot differ.
 */
export function explain(
  kind: VoteKind,
  present: number,
  yes?: number,
  tiebreak?: "yes" | "no",
  abstained = 0,
): Explanation {
  const rule = VOTE_KIND_INFO[kind].rule;
  const counted = countedFor(present, abstained);
  const need = yesNeeded(kind, counted);
  const room = abstained > 0 ? `${counted} counted` : `${present} present`;

  let working: string;
  let needed: string;
  if (rule.type === "moreThanHalf") {
    working = `Half of ${room} is ${counted / 2}; more than half is more than that.`;
    needed = `So ${need} yeses are needed.`;
  } else {
    const exact = (counted * rule.percent) / 100;
    working = `${room} × ${rule.percent}% = ${exact}, rounded up to ${ceilPercent(rule.percent, counted)}.`;
    needed =
      rule.type === "atLeast"
        ? `So ${need} yeses are needed.`
        : `Plus one more yes makes ${need} yeses needed.`;
  }
  if (abstained > 0) {
    working = `${present} present − ${abstained} abstaining = ${counted} counted. ${working}`;
  }
  if (!canPass(kind, counted)) {
    needed += ` That is more than the number ${abstained > 0 ? "counted" : "present"}, so this vote cannot pass in this room.`;
  }

  let outcome: string | null = null;
  if (yes !== undefined) {
    const no = counted - yes;
    const result = decide(kind, yes, counted);
    if (result === "tie") {
      outcome = tiebreak
        ? `${yes} yes and ${no} no is a tie. The Regent broke it with ${tiebreak}, so it ${tiebreak === "yes" ? "passed" : "did not pass"}.`
        : `${yes} yes and ${no} no is a tie. The Regent decides.`;
    } else {
      outcome = `${yes} yes of ${counted} (${need} needed): ${result === "pass" ? "passed" : "did not pass"}.`;
    }
  }
  return { rule: RULE_TEXT[kind], working, needed, outcome };
}
