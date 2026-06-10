# Reddit Posts & Comments Scraper - Resume Notes (PARKED)

**Status:** Parked. Code is complete and correct for Reddit's public JSON API, but Reddit now
**hard-blocks unauthenticated `.json` endpoints** from all proxy/datacenter IPs (and even Apify
residential), returning HTTP 403. Verified on home IP and Apify residential with full browser
fingerprints — all 403. The only reliable path is the **official OAuth API**.

## What was confirmed
- `https://www.reddit.com/r/{sub}/{sort}.json` → 403 from every IP/proxy + header combo tested.
- Reddit also gated **app creation** behind their Responsible Builder Policy (registration), so
  free OAuth credentials weren't obtained.

## What it needs to ship
1. **Reddit OAuth app credentials** (client ID + secret), type "script", from
   reddit.com/prefs/apps (subject to Reddit's Responsible Builder Policy / registration).
2. Implement OAuth in `src/main.ts`:
   - Get a token: `POST https://www.reddit.com/api/v1/access_token`
     with HTTP Basic auth (`clientId:secret`), body
     `grant_type=client_credentials` (app-only) or the installed_client grant.
     Header `User-Agent: <unique descriptive UA>`.
   - Call data endpoints on **`https://oauth.reddit.com`** with `Authorization: bearer <token>`
     (e.g. `https://oauth.reddit.com/r/{sub}/{sort}?limit=100&raw_json=1`).
   - Same JSON response shape as the current parser in `src/routes.ts`, so only the request
     layer changes — `mapPost` / `mapComment` / `flattenComments` are reusable as-is.
3. Add `clientId` / `clientSecret` input fields (or embed the actor owner's app creds so end
   users need nothing — the "no API key" model).
4. Respect Reddit rate limits (~100 requests/min per OAuth client).

## Current safe behavior
- `HttpCrawler` hits the public `.json` endpoints via residential proxy with session rotation.
- `maxRequestRetries: 3` so blocked runs fail fast and cheap (no wasted credits).
- Data guard: charges only per pushed post/comment, so blocked/empty runs charge nothing.

## Reusable assets (no rework needed once OAuth is added)
- `src/routes.ts` - full JSON parsing: posts, nested comments (depth), pagination via `after`.
- `src/types.ts` - PostRecord / CommentRecord.
- `.actor/actor.json` - PAY_PER_EVENT (`post-scraped` + `comment-scraped` @ $0.002), dataset views.
- `INPUT_SCHEMA.json` - inputs (subreddits / keywords / postUrls / sort / filters / proxy).
