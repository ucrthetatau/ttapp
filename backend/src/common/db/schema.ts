// Database schema: every table, relationship, and rule the database enforces.
// Change this file, then run `npm run db:generate -w backend` to create a migration.
//
// Every table has Row Level Security on with no policies. That blocks Supabase's public
// web API from reading or writing any table; our backend connects with the database
// password, which bypasses RLS. Keep .enableRLS() on every new table.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Members double as the allowlist: officers add an email, login fills in the rest.
// Removing someone sets removed_at (soft delete) so their posts and history stay.
export const members = pgTable(
  "members",
  {
    id: id(),
    email: text("email").notNull().unique(),
    name: text("name"), // filled in at first login
    firstLoginAt: timestamp("first_login_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    // Whether this member may answer votes. Officers switch it; the bylaws tie voting to
    // meeting each quarter's voting requirements.
    canVote: boolean("can_vote").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    // Login matches by normalized email, so store it that way.
    check(
      "members_email_normalized",
      sql`${t.email} = lower(trim(${t.email}))`,
    ),
  ],
).enableRLS();

// Role names live in their own table so new roles can be added as rows.
export const roles = pgTable("roles", {
  id: id(),
  name: text("name").notNull().unique(), // member, officer, president, admin
}).enableRLS();

// One row per person per role; a person can hold several roles.
export const memberRoles = pgTable(
  "member_roles",
  {
    id: id(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [unique("member_roles_once").on(t.memberId, t.roleId)],
).enableRLS();

export const votes = pgTable(
  "votes",
  {
    id: id(),
    title: text("title").notNull(),
    // Which bylaw rule decides this vote (see shared/src/voteKinds.ts).
    kind: text("kind").notNull(),
    // The percentage the kind maps to, saved so an old vote still shows what it needed.
    thresholdPercent: integer("threshold_percent").notNull(),
    // How many members were present when the vote opened (a copy of the headcount).
    presentCount: integer("present_count").notNull(),
    status: text("status").notNull().default("open"),
    result: text("result"), // empty while open; pass or fail once closed
    // True when the Regent broke a tie to decide the result.
    tiebreak: boolean("tiebreak").notNull().default(false),
    createdAt: createdAt(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "votes_threshold_range",
      sql`${t.thresholdPercent} between 1 and 100`,
    ),
    check("votes_status_valid", sql`${t.status} in ('open', 'closed')`),
    check(
      "votes_kind_valid",
      sql`${t.kind} in ('majority', 'discussion', 'midway', 'overturn_midway', 'final', 'overturn_final')`,
    ),
    check("votes_present_count_positive", sql`${t.presentCount} >= 1`),
    check(
      "votes_result_matches_status",
      sql`(${t.status} = 'open' and ${t.result} is null) or (${t.status} = 'closed' and ${t.result} in ('pass', 'fail'))`,
    ),
    // Only one vote can be open at a time.
    uniqueIndex("votes_one_open")
      .on(t.status)
      .where(sql`${t.status} = 'open'`),
  ],
).enableRLS();

// "Who is present": the headcount the president sets once for a meeting. It is one row (the
// id is always 1). It expires by itself: the backend treats it as unset when the last
// activity (this row changing, or a vote opening or closing) is more than 90 minutes old.
export const meetingHeadcount = pgTable(
  "meeting_headcount",
  {
    id: integer("id").primaryKey().default(1),
    presentCount: integer("present_count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("meeting_headcount_one_row", sql`${t.id} = 1`),
    check("meeting_headcount_positive", sql`${t.presentCount} >= 1`),
  ],
).enableRLS();

// Who voted what. President-only: never expose these rows to other members.
// Deleting a vote deletes its responses ("wipes everything").
export const voteResponses = pgTable(
  "vote_responses",
  {
    id: id(),
    voteId: uuid("vote_id")
      .notNull()
      .references(() => votes.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    answer: boolean("answer").notNull(), // true = yes
    createdAt: createdAt(),
  },
  (t) => [unique("vote_responses_once").on(t.voteId, t.memberId)],
).enableRLS();

// Feed posts. Deleting sets deleted_at (soft delete) so posts can be restored.
export const posts = pgTable(
  "posts",
  {
    id: id(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => members.id),
    body: text("body").notNull(),
    hasRsvp: boolean("has_rsvp").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }), // null until the author edits it
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("posts_body_not_blank", sql`length(trim(${t.body})) > 0`),
    check("posts_body_max_length", sql`length(${t.body}) <= 2000`),
  ],
).enableRLS();

// RSVPs are public, unlike vote responses. One per member per post.
export const rsvps = pgTable(
  "rsvps",
  {
    id: id(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    answer: boolean("answer").notNull(), // true = yes
    createdAt: createdAt(),
  },
  (t) => [unique("rsvps_once").on(t.postId, t.memberId)],
).enableRLS();

export const driveLinks = pgTable(
  "drive_links",
  {
    id: id(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("drive_links_https", sql`${t.url} like 'https://%'`)],
).enableRLS();

// Firebase device tokens. A member can have several devices; a token belongs to one member.
export const pushTokens = pgTable("push_tokens", {
  id: id(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
}).enableRLS();

// Login sessions. The cookie holds a long random token; only its SHA-256 hash is stored here,
// so reading this table (a teammate, a backup) can't be used to sign in as someone else.
// expires_at slides: each request pushes it 30 days out.
// Code-enforced (not DB): removing a member also deletes their sessions, and the per-request
// lookup rejects anyone with removed_at set.
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      "sessions_expires_after_created",
      sql`${t.expiresAt} > ${t.createdAt}`,
    ),
    // Sign out one member everywhere: delete by member_id.
    index("sessions_member_id_idx").on(t.memberId),
    // The cleanup job deletes expired rows.
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
).enableRLS();

// When each scheduled job last ran, so a missed run can catch up.
export const jobRuns = pgTable("job_runs", {
  jobName: text("job_name").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
}).enableRLS();
