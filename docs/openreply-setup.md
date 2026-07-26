# OpenReply — install, use, and connect Instagram

Operational notes for self-hosting [diwenne/openreply](https://github.com/diwenne/openreply),
an open-source ManyChat alternative for Instagram comment-to-DM automation.

Someone comments a keyword on your reel → OpenReply sends them a DM through Meta's
official API. No scraping, no browser automation, no Instagram password.

---

## 1. What it actually is

Two processes and two datastores. All four must agree on the same secrets.

| Piece | What it does | Where it runs |
| --- | --- | --- |
| Next.js web app | Dashboard, OAuth callback, incoming Meta webhook | Vercel |
| Worker (`npm run worker`) | Consumes the send queue, actually sends the DMs | Railway / any always-on box |
| PostgreSQL | Campaigns, logs, accounts, sessions | Railway |
| Redis | BullMQ send queue + per-account rate limiter | Railway |

The worker **cannot** run on Vercel — serverless functions are short-lived and a
queue consumer has to stay up. This is the single most common self-hosting mistake:
webhooks arrive, nothing sends, because there is no worker.

The web app and worker must share the same `DATABASE_URL`, `REDIS_URL`, and
`ENCRYPTION_KEY`. The web app writes an encrypted Instagram token; the worker
decrypts it to send. Different keys = every send fails to decrypt.

---

## 2. Prerequisites

- **A Facebook account.** Meta developer registration is built on it. There is no Instagram-only path.
- **An Instagram Business or Creator account.** Personal accounts cannot be connected.
  Switch in the Instagram app: Settings → Account type.
- **A [Resend](https://resend.com) account** with a verified sender domain. Login is
  email magic links only — without this, nobody can sign in, including you.
- **Hosting:** Vercel (web) + Railway (worker, Postgres, Redis). Free tiers are enough
  for a single account.

You do **not** need to buy a domain. The free `your-app.vercel.app` URL is what
`NEXTAUTH_URL`, the Meta OAuth redirect, and the Meta webhook all point at.

---

## 3. Local install (verified working)

```bash
git clone https://github.com/diwenne/openreply.git
cd openreply
npm install
cp .env.example .env
docker-compose up -d      # Postgres + Redis
npm run db:generate
npm run db:migrate
npm run dev               # terminal 1 — http://localhost:3000
npm run worker            # terminal 2 — this is what sends DMs
```

Generate the four secrets you own:

```bash
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -base64 32   # CRON_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY  (must be exactly 64 hex chars or the app throws on boot)
openssl rand -hex 16      # WEBHOOK_VERIFY_TOKEN  (any random string; paste the same value into Meta)
```

Confirm it is alive:

```bash
curl -s http://localhost:3000/api/health
```

Healthy output looks like this:

```json
{"status":"ok","checks":{"database":{"status":"ok"},"redis":{"status":"ok","detail":"PONG"},
"queue":{"status":"ok","counts":{"waiting":0,"active":0,"delayed":0,"failed":0,"paused":0}},
"worker":{"healthy":true,"heartbeat":{"status":"running","worker":"dm"}}}}
```

If `worker.healthy` is `false`, the worker is not running or cannot reach Redis, and
no DM will send even though webhooks are arriving.

For Meta to reach a local instance you need a tunnel (`ngrok http 3000`) and
`NEXTAUTH_URL` plus both Meta URLs pointed at the tunnel URL. Tunnel URLs change on
restart, which means re-pasting into Meta each time — hosting on Vercel is less painful.

### Known upstream issue

`npm test` currently fails 7 of 95 tests in `__tests__/dm-worker.test.ts` with
`TypeError: prisma.dmLog.create is not a function`. That is an incomplete Prisma mock
in the test file, not a runtime problem — the app and worker run fine. Ignore it, or
send the fix upstream.

---

## 4. Hosted install

Do Railway first — Vercel needs the database URLs from it.

### Railway (worker + Postgres + Redis)

1. New Project → New → Database → Add PostgreSQL.
2. New → Database → Add Redis.
3. New → GitHub Repo → select **your fork** of openreply.
4. In the worker service Settings, override the commands:
   ```
   Build Command:  npm run db:generate
   Start Command:  npm run worker
   ```
   Do not leave the default `npm run build`. It runs `next build` needlessly, and any
   build step that reaches the database fails here because the worker cannot connect
   to Postgres at build time.
5. In the worker's Variables, add everything from the env table below, using Railway's
   **internal** hostnames (`postgres.railway.internal`, `redis.railway.internal`).

Railway gives you two URLs per datastore. They are not interchangeable:

| Variable | Host | Give it to |
| --- | --- | --- |
| `DATABASE_URL` | `postgres.railway.internal` | the Railway worker only |
| `DATABASE_PUBLIC_URL` | `*.proxy.rlwy.net` | Vercel, and local migrations |

Same for `REDIS_URL` (internal) vs `REDIS_PUBLIC_URL` (public). Vercel runs outside
Railway's private network — give it an internal URL and it hangs and times out.

### Migrate production, once, from your machine

```bash
DATABASE_URL="postgresql://...proxy.rlwy.net.../railway" npm run db:migrate
```

### Vercel (web app)

1. Add New Project → import your fork. Next.js is auto-detected.
2. Settings → Environment Variables → add every variable below.
   - `NEXTAUTH_URL` = your Vercel domain, e.g. `https://your-app.vercel.app`
   - `DATABASE_URL` / `REDIS_URL` = the **public** Railway URLs
   - `ENCRYPTION_KEY` = byte-identical to the worker's
3. Deploy. The build runs `prisma generate` before `next build`.

Vercel's free plan caps each cron at once per day, which is why the repo's crons are
daily. The comment-polling reconciler runs inside the Railway worker instead, so the
free plan is not a constraint there.

### Environment variables

| Variable | What it is |
| --- | --- |
| `NEXTAUTH_URL` | Your public URL — Vercel domain in prod, tunnel URL locally |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | Protects the token-refresh cron |
| `ENCRYPTION_KEY` | `openssl rand -hex 32`. Encrypts Instagram tokens. Identical across web and worker |
| `DATABASE_URL` | Public Railway URL on Vercel; internal on the worker |
| `REDIS_URL` | Must support blocking commands — an HTTP-only Redis will not work with BullMQ |
| `RESEND_API_KEY` | Without it, nobody can sign in |
| `EMAIL_FROM` | A sender on a domain verified in Resend. The placeholder will not deliver |
| `META_GRAPH_API_VERSION` | e.g. `v25.0` |
| `INSTAGRAM_APP_ID` | See step 5.2 |
| `INSTAGRAM_APP_SECRET` | See step 5.2 |
| `FACEBOOK_APP_SECRET` | See step 5.2 |
| `WEBHOOK_VERIFY_TOKEN` | Any random string; the same value goes into Meta's webhook config |

Optional polling-reconciler tuning: `COMMENT_POLL_INTERVAL_MS` (default 300000),
`COMMENT_POLL_MAX_PER_SWEEP` (30), `COMMENT_POLL_LOOKBACK_HOURS` (72).

---

## 5. Connecting your Instagram account

This is the slow part. The code works out of the box; getting Meta to send you comment
events is where the afternoon goes. Have your Vercel domain ready.

### 5.1 Create the Meta app

[developers.facebook.com/apps](https://developers.facebook.com/apps) → Create App.

- App type: **Business**
- Use case: filter to **All**, then pick **Manage messaging and content on Instagram**

Do **not** pick "Create and manage ads with Marketing API" — it carries heavy review
requirements and can block publishing. Do **not** pick "Authenticate with Facebook
Login" — OpenReply uses Instagram Login, and the Facebook Login variant makes OAuth
fail later with a mismatched-client error. If you already added Marketing API, remove it.

### 5.2 Collect three secrets

There are two app IDs and two app secrets, which is the confusing part:

| Env var | Where it lives in the Meta console |
| --- | --- |
| `INSTAGRAM_APP_ID` | Instagram → API setup with Instagram login. A number like `2036...` |
| `INSTAGRAM_APP_SECRET` | Same page, click Show |
| `FACEBOOK_APP_SECRET` | App settings → Basic → App secret → Show |

The Instagram app ID is **not** the Facebook App ID on the Basic settings page. Use the
one under the Instagram product. OpenReply verifies webhook signatures against both
secrets, so set both and you do not have to guess which one Meta signs with.

### 5.3 Add yourself as an Instagram tester — both halves

This is the step people miss. It produces **"Insufficient Developer Role"** on the
Instagram login screen. In development, only accounts with a role on your app can
connect — including your own.

**Half one, Meta side.** App dashboard → App roles → Roles. Find the Instagram testers
section, add the exact Instagram username, send the invite.

**Half two, Instagram side** — the half that gets skipped. Open Instagram as that
account (phone app is easiest):

1. Profile → menu → Settings and activity
2. Apps and websites (older versions: Website permissions → Apps and websites)
3. Tester invites
4. **Accept** the invite from your app

Until you accept here, the account is not really a tester and login keeps failing. No
invite showing? Check you sent it to the exact username, and that the account is
Business or Creator.

### 5.4 Register the OAuth redirect

Instagram product → Set up Instagram business login → Business login settings → OAuth
redirect URIs. Add exactly, no trailing slash:

```
https://your-app.vercel.app/api/instagram/callback
```

Missing or wrong = `redirect_uri` mismatch on connect. You can register more than one,
which is handy when changing domains — keep old and new both listed.

Ignore the "Embed URL" Meta shows here. OpenReply builds its own login URL and requests
these scopes: `instagram_business_basic`, `instagram_business_manage_messages`,
`instagram_business_manage_comments`, `instagram_business_manage_insights`.

### 5.5 Configure the webhook

Still in the Instagram product → Configure webhooks.

- **Callback URL:** `https://your-app.vercel.app/api/webhook`
- **Verify token:** your `WEBHOOK_VERIFY_TOKEN` value
- Click **Verify and save** — it should succeed immediately. If the button is greyed
  out, click into the verify-token field and paste again; editing the callback URL
  often clears it.
- **Subscribe to the `comments` field.**

To test without a real comment: click Test next to `comments`, then click **Send to My
Server**. Two-step control — Test only previews the payload, the second button actually
POSTs it. A row should then appear in your `WebhookEvent` table.

If your primary domain ever changes, update this callback. A non-primary domain
307-redirects the POST, Meta does not reliably follow redirects, and webhooks silently
stop.

### 5.6 Publish the app

**Real comment webhooks are only delivered when the app is Live.** In Development mode,
only the console Test button delivers events. This is the number one reason for
"I set everything up and nothing happens."

Left sidebar → Publish. You must set privacy policy, terms, and data deletion URLs
first. OpenReply ships all three on your domain:

```
https://your-app.vercel.app/privacy
https://your-app.vercel.app/data-deletion
https://your-app.vercel.app/terms
```

### 5.7 Connect the account in the dashboard

Log in to your instance via magic link, then **Settings → Connect Instagram**. You
should reach Instagram's consent screen, not "Insufficient Developer Role".

---

## 6. Using it

Dashboard sections: overview, campaigns, automations, inbox, logs, diagnostics, settings.

**Create a campaign:** pick one of your posts or reels, set one or more keywords
(whole-word or partial match), write the DM. Optionally enable a public reply that
posts under the comment at the same time. `{username}` in the message greets the
commenter by name (falls back to "there" when unavailable). Campaign templates give
you a preset instead of a blank form.

**Tracked links:** swap a raw link for a tracked redirect to get clicks and CTR per
campaign. Tracked links are built from `NEXTAUTH_URL`, so if you add a custom domain
later, update `NEXTAUTH_URL` on **both** Vercel and the worker or links will point at
the old domain.

**Inbox:** read and reply to Instagram DM conversations from the dashboard, inside
Meta's 24-hour messaging window.

**Rate limiting:** capped per account at Meta's documented 750 private replies/hour.
Overflow is queued, not dropped.

**Your own comments never trigger a reply** — Meta rejects DMing yourself anyway.

### End-to-end test

1. Account is a tester and has accepted the invite (5.3); app is published (5.6).
2. Connect it: Settings → Connect Instagram.
3. Create a campaign on a post with keyword `TEST`.
4. From a **different** Instagram account, comment `TEST` on that post.
5. Watch for the DM. Nothing? Check the DM Logs page and `/api/health`.

Done means `/api/health` returns `status: ok` with `worker.healthy: true`, and a
keyword comment from a second account produces a `SENT` row in DM logs.

---

## 7. Debugging

Query Postgres directly — faster than reading logs:

| Table | Tells you |
| --- | --- |
| `WebhookEvent` | Whether Meta delivered the comment at all |
| `DmLog` | Send status and failure reasons |
| `OperationalEvent` | Worker crashes and polling-reconciler sweeps |

Symptom → cause:

- **"Insufficient Developer Role"** → tester invite not accepted on the Instagram side (5.3, half two)
- **`redirect_uri` mismatch** → OAuth redirect missing, or has a trailing slash (5.4)
- **Webhooks arrive, no DM sends** → worker is down; check `worker.healthy` in `/api/health`
- **Nothing happens at all on real comments** → app is still in Development mode (5.6)
- **Every send fails to decrypt** → `ENCRYPTION_KEY` differs between web and worker
- **Vercel hangs on DB/Redis** → you gave it an internal `*.railway.internal` URL instead of the public one
- **App throws on boot** → `ENCRYPTION_KEY` is not exactly 64 hex characters

**The account ID trap** (informational, handled automatically): Meta's `/me` returns
both an app-scoped `id` and the professional account's `user_id`. Webhooks put `user_id`
in `entry.id`. OpenReply stores `user_id`, so fresh connections match correctly. If you
upgraded from a very old build and an account was stored with the wrong ID, disconnect
and reconnect it once.

---

## 8. Letting other people connect their accounts

Everything above runs OpenReply for your own accounts, or a handful you add as testers.
No App Review needed.

For a stranger to connect their own Instagram, Meta requires App Review granting
Advanced Access on the messaging and comments permissions:

- A screencast of the full flow on real accounts, in one take
- Written justification per permission (drafts in `META_APP_REVIEW.md`)
- Business verification — a business registration, articles of incorporation, business
  tax document, or business bank statement

Meta scrutinizes automated-DM apps and often rejects the first submission. Most
self-hosters skip this entirely by running their own instance for their own account.

---

## 9. Security

- `.env` is gitignored. Keep it that way.
- Rotate any secret pasted anywhere it could be logged — including a chat with an AI assistant.
- Instagram tokens are encrypted at rest with `ENCRYPTION_KEY`. Losing or changing it
  means every connected account has to reconnect.
