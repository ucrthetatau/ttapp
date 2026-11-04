// Types shared by the frontend and backend.
// Change a type here and both sides show errors wherever it no longer fits.

/** The four roles. Every active member is a "member"; the rest are granted by an admin. */
export type Role = "member" | "officer" | "president" | "admin";

/** Response from GET /api/auth/me: who is signed in and what roles they hold. */
export type MeResponse = {
  name: string | null; // filled in from Google at first sign-in, if Google sent one
  email: string;
  roles: Role[];
};

/** One row of the member list. Removed members stay in the list with removedAt set. */
export type MemberSummary = {
  id: string;
  email: string;
  name: string | null; // null until their first sign-in
  roles: Role[]; // an active member always holds "member"; the rest are granted
  removedAt: string | null; // ISO timestamp, or null while they are an active member
  erased: boolean; // personal data cleared; only the empty row is kept for history
};

/** Response from GET /api/members: everyone ever added, active and removed. */
export type MembersResponse = {
  members: MemberSummary[];
};

/** Response from POST /api/members. restored is true when a removed member came back. */
export type AddMemberResponse = {
  id: string;
  email: string;
  restored: boolean;
};

/** One shared chapter link, shown on the Links page. */
export type DriveLink = {
  id: string;
  label: string;
  url: string; // always starts with https://
};

/** Response from GET /api/drive-links: every link, sorted by label. */
export type DriveLinksResponse = {
  links: DriveLink[];
};

/** Response from POST /api/votes: the id of the vote that was just opened. */
export type OpenVoteResponse = {
  id: string;
};

/**
 * The open vote, as every member sees it: turnout only, never who voted or the yes/no split.
 * myAnswer is the signed-in member's own answer.
 */
export type CurrentVote = {
  id: string;
  title: string;
  thresholdPercent: number;
  myAnswer: "yes" | "no" | "none";
  /** How many answers have been cast. */
  answered: number;
  /** Active members, the "out of" number for turnout. */
  totalMembers: number;
};

/** Response from GET /api/votes/current: null when no vote is open. */
export type CurrentVoteResponse = CurrentVote | null;

/** Response from POST /api/posts: the id of the post that was just created. */
export type CreatePostResponse = {
  id: string;
};

/** One post in the feed, with everything the screen needs to draw it. */
export type Post = {
  id: string;
  body: string;
  createdAt: string; // ISO timestamp
  editedAt: string | null; // ISO timestamp of the last edit, or null if never edited
  hasRsvp: boolean; // true when the post asks people to answer yes or no
  authorName: string; // their name, else their email, or "Former member" if erased
  yesCount: number;
  noCount: number;
  myAnswer: boolean | null; // your own RSVP: true = yes, false = no, null = none
  canEdit: boolean; // true only for the author (officers can delete, not rewrite)
  canDelete: boolean; // true for the author, and for officers and admins
};

/** Response from GET /api/posts: one page, newest first. */
export type PostsResponse = {
  posts: Post[];
  hasMore: boolean; // true when older posts exist; ask again with ?before=<last createdAt>
};

/** Response from PATCH /api/posts/:id: the saved text and when the post was last edited. */
export type EditPostResponse = {
  body: string; // as saved (trimmed)
  editedAt: string | null; // unchanged text does not count as an edit
};

/** Response from GET /api/posts/:id/rsvps: the names behind the counts, each sorted A to Z. */
export type PostRsvpsResponse = {
  yes: string[];
  no: string[];
};

/** Response from GET /api/health, used to check the backend is running. */
export type HealthResponse = {
  status: "ok";
  time: string; // ISO timestamp, e.g. "2026-10-13T18:30:00.000Z"
};

/** Why a sign-in failed. The backend callback redirects to /sign-in?error=<code>. */
export type SignInError =
  | "cancelled" // pressed Cancel on Google's page
  | "failed" // Google's answer could not be trusted or redeemed
  | "not_member" // the email is not on the member list
  | "server_error"; // our side broke, for example the database is down
