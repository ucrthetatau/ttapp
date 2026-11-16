# Handover: running Theta Tau Hub

For whoever looks after the app next. This says where things live, what each setting does, and what breaks if something is missing. It contains no passwords: those are in the chapter's password manager.

## Where things run

| Piece                       | Where                                             | Notes                                                                |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Website (what members open) | Vercel, https://thetatauucr.vercel.app            | Built from this repo. `vercel.json` sends `/api/...` to the backend. |
| Backend (the server)        | Render, https://ttapp-dheg.onrender.com           | Free tier: it sleeps when idle and takes about a minute to wake.     |
| Database                    | Supabase, projects `ttapp-dev` and `ttapp-prod`   | The live app uses `ttapp-prod`. Use `ttapp-dev` for testing.         |
| Sign-in                     | Google Cloud project owned by the chapter account | Redirect addresses must match the live site exactly.                 |
| Scheduled jobs              | GitHub Actions (`.github/workflows/jobs.yml`)     | Runs daily, see below.                                               |

All of these should sit under the chapter's accounts, not one person's.

## Settings (environment variables)

Never put real values in the repo or in chat. Real values live in the password manager, on Render, and on Vercel.

**Render (backend)**

| Name                                       | What it is                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `NODE_VERSION`, `NODE_ENV`                 | `22` and `production`                                                                       |
| `DATABASE_URL`                             | Connection string for `ttapp-prod`                                                          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in                                                                              |
| `GOOGLE_REDIRECT_URI`                      | `https://thetatauucr.vercel.app/api/auth/google/callback`                                   |
| `CRON_SECRET`                              | Password for the scheduled-jobs endpoint. Same value as the GitHub secret of the same name. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | The doorbell (see below), from `ttapp-prod`                                                 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`    | Push notifications (see below). The private key is a secret.                                |
| `VAPID_SUBJECT`                            | A contact address for the push services: `https://thetatauucr.vercel.app`                   |
| `GOOGLE_SERVICE_ACCOUNT_JSON`              | The dashboard's Google key (see "The dashboard"), on one line. A secret.                    |

**Vercel (website)**

| Name                                                 | What it is                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | The doorbell, from `ttapp-prod`. Changing them needs a redeploy. |

**GitHub repository secret:** `CRON_SECRET`.

Local development uses `backend/.env` and `frontend/.env.local` (both are git-ignored). Copy from the `.env.example` files, and point them at `ttapp-dev`, never prod.

## The doorbell (live "New announcements" banner)

When someone posts, edits or deletes an announcement (called a "post" in the code), the backend sends an empty signal through Supabase Realtime, and open feed pages show a banner ("New announcements" or "Announcements changed") to tap. RSVP answers ring too: the page quietly updates the counts and the member's own answer (never post text). The signal carries no post text. Every page is live. The signals are grouped into topics so a page only hears what concerns it:

- **`feed`:** posts and RSVPs (Announcements page).
- **`votes`:** a vote opened, answered, closed or deleted; the headcount changed; someone's "can vote" switch changed (Votes page).
- **`members`:** a role was granted or revoked, or a member was removed or erased. Every signed-in app listens and quietly asks `/api/auth/me` again, so a new role shows up without a reload and a removed member is signed out at once.
- **`member-list`:** any change to the member list: added, roles, can vote, removed, first sign-in (Members page).
- **`links`:** a link was added or removed (Links page).

Two listeners open at the same time must not share a topic: they would share one connection, and closing one page would hang up the other. That is why the Members page has `member-list` and not `members`. The names are in `shared/src/doorbell.ts`.

The Votes page also re-checks the open vote every 10 seconds and reloads everything about once a minute, in case a ring is missed. The Members and Links pages have no such check: after a missed ring they update when reopened.

- **Where to find the values:** in the Supabase project, Project Settings, then Data API for the URL and API Keys for the publishable key. The URL must be the bare `https://<id>.supabase.co`, not the `/rest/v1/` address. Use the publishable key, never the secret key.
- **If the settings are missing or wrong:** nothing breaks. The feed still loads and refreshes when you open it or return to the app. Only the live banner stops.
- **Limit:** Supabase's free plan allows about 200 open connections at once (one per open feed page). A chapter-sized group is far below that.
- **Dev and prod are separate.** Each Supabase project has its own channel, so a test post on dev never rings prod.

## Push notifications

When a vote opens, members who can answer it get a push; when someone posts, every active member except the author does. The message goes through the push service of the member's own browser (Google, Apple, Mozilla or Microsoft) and is encrypted so only that browser can read it. An officer can also send a dues reminder (see The dashboard). Nothing else notifies: not edits, deletes, closed votes, or requirements.

**What members see**

- **The switch:** the three-line menu button (every member has it) opens a panel with a Notifications switch at the bottom. Turning it on asks the browser for permission, then saves that device with the backend. It is per device: a phone and a laptop are turned on separately.
- **The pop-up:** after sign-in a one-time pop-up with an "Allow notifications" button asks members to turn it on (it never shows the browser prompt by itself: the button is the tap that does, and it tells people to tap Allow when the phone asks). It shows once per member per device. On an iPhone that has not installed the app it shows the Add to Home Screen steps instead.
- **iPhone:** notifications only work in the app installed to the Home Screen, not in a Safari tab.
- **Showing the pop-up again:** each phone remembers that it already showed the pop-up, so someone who skipped it never sees it again. On the Members page (officers and admins) the "Notification pop-up" card shows how many members have notifications on and has a **Show the pop-up again** button. It raises a version number (table `notification_prompt`, migration 0013); every phone that showed an older version shows the pop-up again the next time the app opens, but only if that member still has notifications off or, on iPhone, has not installed the app. People who already turned them on are not bothered. Nothing is pushed or rung, so open apps pick it up on their next open. It cannot help someone who tapped Don't Allow: the browser has blocked the site and they must allow it in their phone's settings.
- **If a member taps No** on the browser prompt, the browser blocks the site and the switch shows how to fix it: they must allow notifications in the browser or phone settings. The app cannot ask again.
- **Signing out** turns notifications off on that device. A second member signing in on the same phone starts with the switch off and does not inherit the first member’s notifications (the browser remembers who turned it on).
- **When the app is open and on screen,** no popup appears: the live doorbell has already updated the page. Closed or in the background, the notification shows, and tapping it opens the Votes or Announcements page.

**Running it**

- **Keys:** one pair per environment. Make it with `npx web-push generate-vapid-keys`. Dev and prod must differ, because a browser's subscription belongs to the public key it was made with. Put the private key only in Render's settings and the password manager.
- **If you change the keys,** every member's subscription stops working (the push services reject it). Members would have to turn the switch off and on again. Do not rotate them casually.
- **If the keys are missing or wrong:** nothing breaks. Votes and posts work as before and nothing is sent. Turning the switch on shows "Notifications aren’t set up on the server yet".
- **Dead devices clean themselves up:** when a push service says a browser is gone, that subscription is deleted on the spot. Removing or erasing a member deletes theirs too.
- **A browser on a new push service** is refused when it subscribes. The allowed hosts are the list `PUSH_SERVICE_HOSTS` in `backend/src/features/push/routes.ts`. They are limited so a member cannot make our server send requests to some other website.

## Votes: things worth knowing

- **Voting pop-up:** when an open vote is waiting for a member's answer, the Votes page shows it in a pop-up with Yes and No. "Decide later" closes it and the vote stays on the page with its buttons.
- **Closing early:** the Regent (the president role) can close a vote before everyone has answered. Members who have not answered count as **no**. The only thing the backend refuses is more answers than people present; then the Regent must fix who is present first. A tie is broken by the Regent choosing yes or no at close.
- **Abstaining:** the Regent can say how many of those present are sitting a vote out (stepped out, asleep). It is a plain number, not names, set with a **− n +** stepper in the "Open a vote" pop-up (default 0) and adjustable on the open vote. The vote is measured against present minus abstaining: "yeses needed", the tie rule and the info text all use that counted number, and closing is refused if more people answered than are counted. Quorum still uses the full headcount (abstainers are in the room). Lowering the headcount lowers the abstainers if needed, so one member is always counted. Everyone sees the abstained count on past results. The bylaws (Art V Section II.2) say no abstaining; the chapter chose to add it. Stored as `votes.abstain_count` (migration 0012).
- **Not tested end to end on the real database:** closing a vote early, and giving a second person the president role in the Admin page (several presidents are allowed).

## Voting-only mode

`VOTING_ONLY` in `frontend/src/features.ts` is a switch for meetings where the chapter uses the app only to vote. When `true`, only Votes (plus Admin for officers) is shown, and the Home, Posts and Links addresses lead to Votes. It only changes what screens show; the backend still enforces every permission. It is `false` now. To use it, set it to `true`, merge and let Vercel deploy; set it back to `false` the same way afterwards.

## The dashboard (Google Sheets and Calendar)

The dashboard reads dues, requirements and events from Google. Nothing is copied into our database: only the IDs of the sheets and calendars are stored (table `dashboard_sources`).

**One-time setup**

1. In the chapter's Google Cloud project, turn on the Google Sheets API and the Google Calendar API.
2. Create a service account (IAM and Admin, Service Accounts) with no roles, add a JSON key, and paste the whole file as one line into Render as `GOOGLE_SERVICE_ACCOUNT_JSON`. Keep the file in the password manager. Never commit it or paste it in chat.
3. Share each sheet with the service account's email as **Viewer**, and each calendar as **See all event details**. The "Dashboard setup" page (side menu, officers and admins) shows that email.

**Every quarter** (no developer needed): open the new tab, copy the address from the browser bar, and paste it on the Dashboard setup page. The page reads the sheet, shows the header cells, and an officer picks the columns (it guesses the likely ones). The columns are saved by their header text, so they are found again by name even if letters shift.

**How a member is matched to a row.** The sheets have no reliable email column, so the app matches the name on the member's Google account against the person column (or by email if that column is called EMAIL). Case, accents and punctuation are ignored. Full name first, then first plus last word. If the same name sits on two sheet rows the save is blocked; if two members share one Google name, both see "not available" rather than a guess. A member who has never signed in has no name yet and cannot match. Dashboard setup reports the match rate and lists unmatched rows (normal when test accounts exist).

**What is shown.** Requirements: a percentage; 80 or higher counts as meeting them (the threshold is a number on the requirements source, editable on Dashboard setup). Dues: status plus still to pay, computed as charged minus paid, never below 0.

**Dues reminder.** On Dashboard setup (officers and admins), "Remind everyone who owes" opens a pop-up: the officer picks a due date, sees every member who would be notified with their amount, and presses Send. Each member gets their own push, "You owe $85 in dues, due Dec 1.", on every device they turned notifications on for.

- It is manual on purpose: nothing is sent automatically, and there is no waiting period between sends. A second press while one is still sending is refused.
- The list is worked out again by the backend from the sheet on every send; the browser only sends the due date.
- Skipped: members who owe nothing, have no matching row, share a name with another member or sheet row, have an unreadable amount, or have no device with notifications on. The pop-up lists them under "Can't be reached" so an officer can text them.
- **Test first:** "Send a test to me only" in the same pop-up sends the same notification to the officer's own devices only, titled "Dues reminder (test)". It uses their own amount if they owe something, a sample ($25) otherwise, and is not logged. Use it to check a real phone before the first real send.
- The table `dues_reminder_sends` only records each send (who, due date, how many) for the "Last sent" line. Migration 0011.
- Not tested against real Google or real phones at the time of writing.

**Good to know**

- A member only ever receives their own row.
- Changes in a sheet take up to about a minute to show (a one-minute cache shared by everyone).
- If the key is missing or wrong, nothing breaks: the page says Google isn't set up and the dashboard cards stay empty. Each card loads and fails on its own.
- Verified against the real Google sheets and calendar in production. Only calendars shared with the service account can be read.
- Not built: a per-member "name in the sheet" override for nicknames.
- Requirements reminders were built and then removed on purpose (PR #155 and its revert): members meet requirements at different times, so a blanket reminder would nag people who are on schedule. Dues are the only reminder.

## Scheduled jobs and keeping things awake

A GitHub Action calls the backend once a day (about 09:17 UTC). It does two things: reads one row from the database so Supabase doesn't pause the free project after a week of no use, and deletes expired login sessions. It can also be run by hand from the repo's Actions tab.

- GitHub switches scheduled workflows off after 60 days with no activity on a public repo. Keep making commits, and watch for GitHub's warning email.
- If the app shows database errors, first check whether the `ttapp-prod` project in Supabase has been paused (the dashboard says so) and whether the last run of "Scheduled jobs" was green. A paused project can be resumed from the dashboard.

### Keeping the backend (Render) awake

Render's free plan puts the backend to sleep after about 15 idle minutes, and the next request then takes about a minute. The daily job above is far too rare to prevent that, so a second job pings the backend every 5 minutes. It lives **inside the `ttapp-prod` database** (Supabase Cron plus the `pg_net` extension), not in this repo, so it is easy to forget. This is the only copy of how it is set up.

What it calls: `GET /api/health`, which touches no database and needs no login.

**Set it up** (once, in the Supabase SQL editor on `ttapp-prod`; it is not a migration):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ping-backend',
  '*/5 * * * *',
  $$ select net.http_get('https://ttapp-dheg.onrender.com/api/health') $$
);
```

If either `create extension` line is refused, turn the extension on in the dashboard (Database, then Extensions) and run the rest again.

**Check that it works** (a few minutes after setting it up):

```sql
-- the last pings and what the backend answered (look for status_code 200)
select created, status_code, error_msg
from net._http_response
order by created desc
limit 10;

-- whether the schedule itself is running
select status, start_time, return_message
from cron.job_run_details
order by start_time desc
limit 5;
```

**Stop it:** `select cron.unschedule('ping-backend');`

Things to know:

- **Confirmed 2026-11-04.** Supabase's docs only show Cron calling its own Edge Functions, but `pg_net` is general HTTP and the first ping to Render returned 200. To re-check any time, run the first query above and look for a new row every 5 minutes.
- **If Supabase pauses the project, this stops with it, silently.** Keep the daily GitHub job above: it is what keeps the database from pausing. Whether the 5-minute job's own activity counts toward that is not confirmed.
- **If the Render address changes,** run `cron.unschedule('ping-backend')` and schedule it again with the new address.
- **Render's free plan gives about 750 instance-hours a month for the whole account.** One service awake all month uses about 744, so any other free Render service on the same account shares that pool.
- **No alert if the backend goes down.** This job only pings; it does not tell anyone. A free outside monitor (UptimeRobot or similar) could add that later.

## Announcements have titles

Announcements are called posts in the code: the address `/posts`, the API `/api/posts` and the table `posts` were not renamed. A new announcement needs a title (required, up to 80 characters) and may have details; the RSVP toggle is optional. Posts from before titles existed have no title and stay editable, but they must keep some words; a titled post must keep its title. Push notifications for new posts show the title. This came with migration 0010 (adds `posts.title`).

## Profile photos

Announcements show the author's Google profile photo instead of their initials (the feed and the dashboard's latest-announcements card). Google's sign-in token carries the photo link; it is saved on the member (`members.picture_url`, migration 0014) at **every** sign-in, so a changed Google photo follows them. Only the link is stored, never the image. If a member has no photo, or the link fails to load, the avatar falls back to initials.

- **Only Google's picture host is accepted:** the address must be https on `*.googleusercontent.com`. This is checked in `backend/src/features/auth/picture.ts` and again as a database rule, because the address is shown to other members as an `<img>`.
- **Erasing a member** clears the link. Photos are only in responses to signed-in members.
- **The app only learns a photo at sign-in.** Sessions last 30 days and extend with use, so after this shipped photos appeared gradually as people signed in. To refresh everyone at once, sign everyone out one time: in the Supabase SQL editor on `ttapp-prod` run `delete from sessions;` (everyone, including you, then signs in again).

## The look (dark red and gold) and trying colors

Every color is a token in `frontend/src/index.css` under `@theme` (`page`, `surface`, `bar`, `gold-400`, `gold-300`, `gold-tint`, `line`, `ink`), plus the shared classes `.card`, `.btn-main`, `.btn-outline`, `.btn-small`, `.badge`, `.field`. Text is cream on a dark red page with near-black maroon cards and gold buttons. Light mode was tried and dropped.

**To try a color change without touching the live site:** make a local branch, edit the tokens, run `npm run dev:backend` and `npm run dev:frontend`, look at it. Do not push. To undo: `git restore .` then `git checkout main`. Check contrast on the dashboard, Posts, Votes, Links and the pop-ups before shipping a new palette.

## Changing the database

Table changes are migration files in `backend/drizzle/`. To apply them: `npm run db:migrate -w backend` with `DATABASE_URL` pointing at the target database.

**Order matters:** apply a new migration to `ttapp-prod` _before_ the code that needs it is merged and deployed. Otherwise the live backend asks for a column that is not there yet.

Check that it worked by looking at the table's columns in the Supabase SQL editor, not only the terminal.

## Things the app does not do

- **It does not manage Google Drive access.** Removing a member from the app does not remove their access to shared Drive files. Do that in Drive.
- **Erasing a member** clears their personal details but keeps an empty record, so old posts and votes still add up. Their posts show as "Former member".
