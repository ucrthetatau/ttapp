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

**Vercel (website)**

| Name                                                 | What it is                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | The doorbell, from `ttapp-prod`. Changing them needs a redeploy. |

**GitHub repository secret:** `CRON_SECRET`.

Local development uses `backend/.env` and `frontend/.env.local` (both are git-ignored). Copy from the `.env.example` files, and point them at `ttapp-dev`, never prod.

## The doorbell (live "New posts" banner)

When someone posts, edits or deletes a post, the backend sends an empty signal through Supabase Realtime, and open feed pages show a banner ("New posts" or "Posts changed") to tap. The signal carries no post text. Other changes, such as RSVP answers, do not ring yet.

- **Where to find the values:** in the Supabase project, Project Settings, then Data API for the URL and API Keys for the publishable key. The URL must be the bare `https://<id>.supabase.co`, not the `/rest/v1/` address. Use the publishable key, never the secret key.
- **If the settings are missing or wrong:** nothing breaks. The feed still loads and refreshes when you open it or return to the app. Only the live banner stops.
- **Limit:** Supabase's free plan allows about 200 open connections at once (one per open feed page). A chapter-sized group is far below that.
- **Dev and prod are separate.** Each Supabase project has its own channel, so a test post on dev never rings prod.

## Scheduled jobs and keeping things awake

A GitHub Action calls the backend once a day (about 09:17 UTC). It does two things: reads one row from the database so Supabase doesn't pause the free project after a week of no use, and deletes expired login sessions. It can also be run by hand from the repo's Actions tab.

- GitHub switches scheduled workflows off after 60 days with no activity on a public repo. Keep making commits, and watch for GitHub's warning email.
- If the app shows database errors, first check whether the `ttapp-prod` project in Supabase has been paused (the dashboard says so) and whether the last run of "Scheduled jobs" was green. A paused project can be resumed from the dashboard.

## Changing the database

Table changes are migration files in `backend/drizzle/`. To apply them: `npm run db:migrate -w backend` with `DATABASE_URL` pointing at the target database.

**Order matters:** apply a new migration to `ttapp-prod` _before_ the code that needs it is merged and deployed. Otherwise the live backend asks for a column that is not there yet.

Check that it worked by looking at the table's columns in the Supabase SQL editor, not only the terminal.

## Things the app does not do

- **It does not manage Google Drive access.** Removing a member from the app does not remove their access to shared Drive files. Do that in Drive.
- **Erasing a member** clears their personal details but keeps an empty record, so old posts and votes still add up. Their posts show as "Former member".
