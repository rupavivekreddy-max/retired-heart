# Retired Heart

Share love and family stories that ended in pain. Readers give a broken heart; the most heartbreaking story (and reply) comes first. Text only, any language, Google sign-in, one username per Google account.

Built for Cloudflare's free tier: static site + Pages Functions (API) + D1 (SQLite database).

```
public/        the website (intro animation, feed, stories, replies, privacy page, ads.txt)
functions/     the API (runs on Cloudflare)
schema.sql     the database tables
test/run.mjs   22 automated rule checks (node --no-warnings test/run.mjs)
```

## The rules, as built

- Reading needs no login. Posting, replying and breaking hearts need Google sign-in.
- One Google account = one username, chosen once, never changed. Age is shown publicly.
- Text only. The author picks the story's language from a list.
- One broken heart per person per story or reply. You cannot break a heart on your own post.
- Stories: first story is free. To post again, delete your earlier story, or have your newest story pass the ladder: 2nd needs more than 100 broken hearts, 3rd more than 1,000, 4th more than 10,000, then 10x each time.
- Replies use the same ladder, counted separately on each story.
- Feed and replies sort by most broken hearts. A Report button saves reports to the `reports` table.

## Deploy for free (about 30 minutes)

You need a free Cloudflare account, a free GitHub account and a Google account.

### 1. Put the code on GitHub
Create a repository and upload this folder (the `.dev.vars` file is ignored on purpose).

### 2. Create the database
Cloudflare dashboard > Storage & databases > D1 > Create database, name it `retired-heart`. Open it > Console, paste the contents of `schema.sql`, run it.

### 3. Create the site
Workers & Pages > Create > Pages > Connect to Git > pick your repository.
Build command: leave empty. Build output directory: `public`.

### 4. Connect the database and secrets
Pages project > Settings > Bindings > add D1 database: variable name `DB`, database `retired-heart`.
Settings > Variables and secrets, add:

| Name | Value |
|---|---|
| `SESSION_SECRET` | any long random text (40+ characters). Keep it secret. |
| `GOOGLE_CLIENT_ID` | from step 5 |
| `ADSENSE_CLIENT` | later, like `ca-pub-1234567890123456` |
| `ADSENSE_SLOT` | later, your ad unit's slot number |

Do not add `DEV_AUTH` on the live site. It is only for testing on your own computer.
After changing variables, redeploy once (Deployments > Retry deployment).

### 5. Google sign-in
console.cloud.google.com > create a project > APIs & Services > OAuth consent screen (External) > fill the app name and your email, publish the app.
Credentials > Create credentials > OAuth client ID > Web application.
Authorized JavaScript origins: add your site address (for example `https://retired-heart.pages.dev`, and later your own domain). Copy the Client ID into `GOOGLE_CLIENT_ID`.

## Domain and AdSense

AdSense does not approve sites on free subdomains such as `pages.dev`. You need a domain you own.

- If you are a student, the GitHub Student Developer Pack (education.github.com/pack) has included a free domain for a year through partners. Check what is offered now. Your college email may qualify.
- Otherwise a `.xyz`, `.site` or `.online` domain is often about $1 to $3 for the first year.

Add it in the Pages project > Custom domains (Cloudflare gives the exact DNS steps). Then add the new address to the Google OAuth origins.

AdSense steps:
1. Sign up at adsense.google.com with your domain.
2. Put your publisher ID in `public/ads.txt` (replace `pub-0000000000000000`), and redeploy.
3. Wait for approval. It can take days or weeks. Google wants real content and some visitors first, plus the privacy page (already included, edit the contact email in `public/privacy.html`).
4. After approval create a Display ad unit, then set `ADSENSE_CLIENT` and `ADSENSE_SLOT`. Ads then appear every 5 stories and inside replies, only for visitors who tap "Allow ads".

## Storage and scale

Text is tiny: 1 million stories at about 2 KB is roughly 2 GB, and D1's free plan includes 5 GB.
The limit you will hit first is requests. The free Workers plan allows about 100,000 API requests per day, which is a few thousand daily readers. For large traffic, switch the account to Workers Paid (about $5 a month, millions of requests included). Check current numbers at developers.cloudflare.com/workers/platform/pricing and developers.cloudflare.com/d1/platform/pricing.

## Test on your computer

```
npm install
npm run db:local
npm run dev        # http://localhost:8788, uses the test login from .dev.vars
node --no-warnings test/run.mjs
```
