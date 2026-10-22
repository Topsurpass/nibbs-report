# Push notifications (Duty Register)

Web Push with VAPID through [`web-push`](https://github.com/web-push-libs/web-push). No Firebase or OneSignal account is needed: the browser's own push service (Google for Chrome/Edge/Android, Mozilla for Firefox, Apple for Safari) carries the message.

## What gets sent

| When | To whom | Title (example) | Tap opens |
|---|---|---|---|
| Someone signs in / out (themselves) | every other subscribed member | "Ada Obi signed in" | `/attendance?shift=…` |
| Shift opens (12:00 weekdays, 14:00 weekends, 20:00 night) | everyone subscribed with no entry | "Afternoon duty has started" + **Not on duty today** button | that shift |
| 60 min after the open | same, unless they signed in or said not on duty | "Still not signed in for this afternoon" | that shift |
| Shift closes (20:00 / 08:00) | anyone signed in and not out | "Afternoon duty has ended" | that shift |
| 10 min before sign-out locks (20:20 / 08:20) | same | "Sign out now: … locks at 20:30" (stays on screen) | that shift |

- Admin corrections never alert the team.
- A repeat tap on Sign in changes nothing and alerts nobody.
- "Not on duty today" (on the notification or in the in-app pop-up) is stored server-side, so it silences that shift on every device.

## Code

- **`src/lib/push/schedule.ts`:** pure. It decides which reminders are due and what every notification says (tested).
- **`src/lib/push/endpoints.ts`:** only real browser push services can be registered, so the server can't be pointed at arbitrary hosts.
- **`repository.ts`:** the database tables:
  - devices (`nibbs_push_subscriptions`);
  - the send log (`nibbs_push_log`), which is both the trace and the once-only guard for reminders;
  - dismissals (`nibbs_shift_dismissals`).
- **`sender.ts`:** sends the notification, deletes devices the push service reports gone (404/410), and never throws.
- **`broadcast.ts`:** the team alerts. Sign-in and sign-out call it through `after()`, so the response isn't delayed.
- **`reminders.ts`:** `runDueReminders(now)`, which the cron endpoint calls.
- **Browser side:**
  - `public/sw.js` handles push, the click (focus or open `/attendance?shift=…`) and the not-on-duty action;
  - `PushProvider`, `NotificationBell` and `PushBanner` are the UI;
  - `src/app/manifest.ts` lets iPhones install the app, which they need for push.

## Setup (once)

1. **Keys.**
   - Run `npx web-push generate-vapid-keys`.
   - In Vercel → Project → Settings → Environment Variables, set:
     - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
     - `VAPID_PRIVATE_KEY`
     - `VAPID_SUBJECT` (`mailto:you@…`)
     - `CRON_SECRET` (any long random string)
   - Redeploy, because the public key is built into the page.
2. **Tables.** Run `npm run db:push` (additive, idempotent).
3. **Scheduler.** Vercel Hobby crons only run once a day, so use [cron-job.org](https://cron-job.org) (free). Create a job:
   - **URL:** `https://<your-app>/api/cron/shift-reminders`
   - **Schedule:** every 5 minutes
   - **Request method:** GET
   - **Header:** `Authorization: Bearer <CRON_SECRET>`

   Each run returns `{ due, sent, failed, noDevice, pruned }`, and the job history shows it. Calling it more often is harmless: each reminder is claimed in the log before it's sent.
4. **Each person:** clicks the bell in the header (or the banner on the Duty Register) → **Turn on notifications**, on each device they use. On iPhone, first Share → **Add to Home Screen**, open the app from there, then turn it on.

## Tests

- **Gate:** `src/lib/push/*.test.ts`.
- **Eval:** start the app with `PUSH_ALLOW_LOCAL_TEST_ENDPOINTS=1 npm run dev`, then run `npm run eval:push`.
  - It runs a mock push service on localhost and decrypts every push the app sends (RFC 8291).
  - It checks the team alerts, every reminder, dedup, "not on duty", 410 pruning and the cron secret.
  - Test users are cleaned up afterwards.
  - Its cron runs are scoped to its own users and a 2020 date.
