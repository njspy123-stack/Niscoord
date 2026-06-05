# Niscoord

Niscoord is starting with the first piece that a Discord-style product needs: account creation, email verification, sessions, and notification preferences.

## What this build includes

- Account creation with username, email, and password
- Secure password hashing with PBKDF2 + salt
- Session cookies for sign-in persistence
- Email verification codes
- Resend-backed email delivery for production
- Safe `dev` email mode for local setup
- Notification preference toggles
- Test notification email sending
- Cloudflare Pages Functions + D1 project structure

## Project layout

- `public/` static frontend for account flows
- `functions/api/` Cloudflare Pages Functions routes
- `functions/_lib/` shared auth, database, and email helpers
- `wrangler.toml` Cloudflare Pages and D1 configuration
- `schema.sql` schema reference

## Environment and bindings

This project expects a D1 binding named `DB`.

Optional production email settings:

- `RESEND_API_KEY`
- `EMAIL_FROM`

Optional app settings:

- `APP_BASE_URL`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_DAYS`
- `VERIFICATION_CODE_TTL_MINUTES`
- `EMAIL_DELIVERY_MODE`

`EMAIL_DELIVERY_MODE` values:

- `dev`: does not send real email, but keeps the flow usable during development
- `resend`: sends real email through the Resend API

## Local development

1. Install Wrangler if it is not already available.
2. Create a D1 database and put the database ID into [wrangler.toml](C:\Users\Noah\Documents\Codex\2026-06-04\ok-we-are-making-the-scos\wrangler.toml).
3. Set secrets for production-style email if you want real delivery:
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
4. Run the Pages project locally with Wrangler so static files and Functions run together.

Suggested commands:

```powershell
npx wrangler d1 create niscoord-db
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler pages dev public
```

## Deployment notes

This repo is prepared for Cloudflare Pages deployment, but the actual deploy still needs:

- a Cloudflare account logged into Wrangler
- a real D1 database ID
- a Pages project named `niscoord`
- real email provider secrets if you want verification emails to go out

With those in place, deploy with Wrangler or a Git-connected Pages project.

Direct upload command:

```powershell
npx wrangler pages deploy public --project-name niscoord
```

Important:

- Do not use `npx wrangler deploy` for this repo. That is the Workers deploy command, and this project is set up as a Pages project.
- If you are using Cloudflare Pages with Git integration, do not set the deploy command to `npx wrangler deploy`.
- For a simple first deployment in the Cloudflare dashboard, use:
  - Framework preset: `None`
  - Build command: leave blank
  - Build output directory: `public`
  - Root directory: repo root

## Next phases

After this account foundation, the next logical steps are:

1. Server creation and membership
2. Channel model and permissions
3. Real-time messaging
4. Direct messages and friends
5. File uploads, presence, and notifications
