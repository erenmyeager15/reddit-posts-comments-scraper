# Reddit Customer Research & Competitor Insights

Turn a properly licensed Reddit CSV/JSON export into customer research and competitor insights for US SaaS teams, product agencies and brand analysts. Review pain-point phrases, feature-request cues, literal competitor mentions, supplied thread relationships and snapshot differences — without a live Reddit request or an external AI bill.

**This is an authorized export analyzer, not a live Reddit scraper.** The former subreddit/search/post-URL collector is retired in this redesign. No API key or proxy is used because nothing is fetched from Reddit. Synthetic demos contain developer-invented text, brands, IDs and communities; they are not customer evidence or source access.

## What you get

- **Textual review cues:** transparent English phrase rules for pain points, feature requests, recommendation questions, switching phrases, pricing questions and question marks. These are prompts for human review, not sentiment scores or validated buying intent.
- **Product and brand mention comparisons:** case-insensitive literal terms, counted once per selected record. Supplied-sample shares are not market share, geographic reach or unique people.
- **Thread evidence audit:** missing parents, parent cycles, cross-thread links, unknown roots and capped selections stay explicit. Comment counts are compared with the supplied root snapshot, not presented as proof of full thread coverage.
- **Snapshot comparisons:** score, declared-comment-count and redacted-text differences for matching IDs within your selected time window. Different metric bases are not compared; scores may be fuzzed. No live growth or causation is inferred.
- **Deletion and privacy safeguards:** latest supplied tombstones and explicit removal keys suppress records and their supplied history; removed roots suppress supplied comments. Author/profile columns are dropped and common email, contact, credential, user-reference and URL patterns are redacted.
- **Five formula-guarded CSV reports, JSON evidence and a readable summary.** Each report records its source/synthetic scope. Multiple supplied observations are included in one unique-record analysis, not treated as separate results.

US refers to the intended research audience, **not a claim that the supplied authors are in the United States**. No personal profiles, outreach, AI model training, live alerts or monitoring schedule are provided.

## Choose the right mode

### 1. Preview a clearly labeled synthetic demo

```json
{
  "mode": "demo",
  "demoPreset": "us-saas-research",
  "watchTerms": ["AtlasApp", "NimbusApp"]
}
```

The three presets are:

| Preset | Research preview |
| --- | --- |
| `us-saas-research` | Invented pain-point, feature-request and recommendation phrases |
| `us-brand-comparison` | Invented per-record mentions of AtlasApp and NimbusApp |
| `us-thread-quality` | Invented missing parents, cycles, stale times and snapshot changes |

Demo saves **zero dataset rows** and requests **zero post/comment result events**. Open **REPORT**, **REPORT.md** and the CSV artifacts in the run's output/key-value store; an empty dataset is intentional. Each run charges **$0.001 Actor Start**, with platform usage included under the current pricing. Demo is not a free run or a live-data sample.

Leave import text/provider blank and rights confirmation unchecked in demo. Nonempty import fields are rejected, not silently ignored.

### 2. Analyze an authorized CSV or JSON export

Use this route only if your export **and derived analysis through this service** are properly licensed. Commercial Reddit use may require a separate agreement or written approval; public visibility, an API account, another scraper's output and checking a box do not establish those rights. See [Reddit Developer Terms](https://redditinc.com/policies/developer-terms) and [Data API Terms](https://redditinc.com/policies/data-api-terms).

Select `mode: "import"`, identify your authorized provider in `importSource`, and set `authorizedData: true` **only when you actually have the required rights**. Paste exactly one nonempty `importJson` array-as-text or `importCsv` string. The form marks the payload fields secret; API clients must use Apify's supported secret-input encryption if they require encrypted storage. Normalized outputs and downloads are not anonymized or automatically encrypted by that input setting.

Example observation structure below is **invented developer text, not Reddit content**:

```json
[
  {
    "recordType": "post",
    "postId": "demo001",
    "subreddit": "synthetic_saas_lab",
    "title": "What tool can replace AtlasApp?",
    "bodyText": "I wish we had better exports.",
    "createdAt": "2026-10-10T00:00:00Z",
    "observedAt": "2026-10-12T00:00:00Z",
    "score": 20,
    "declaredCommentCount": 1,
    "isNSFW": false
  },
  {
    "recordType": "comment",
    "postId": "demo001",
    "commentId": "reply01",
    "bodyText": "Please add CSV exports.",
    "createdAt": "2026-10-11T00:00:00Z",
    "observedAt": "2026-10-12T00:00:00Z",
    "parentCommentId": null,
    "score": -2,
    "isNSFW": false
  }
]
```

For JSON API input, `importJson` is a **string**, e.g. `JSON.stringify(observations)`, not a nested array. JSON input or CSV rows must be flat observations; raw nested Reddit Listing objects are not accepted. The Actor does not download files, resolve URLs, call APIs or open the supplied record IDs.

### Export columns

| Field | Meaning and validation |
| --- | --- |
| `recordType` | Required `post` or `comment`; alias `dataType` |
| `postId` | Required lowercase base36 string, 1–20 characters; optional `t3_` prefix |
| `commentId` | Required for comments; optional `t1_` prefix. `id` can replace the type-specific ID, but do not supply both |
| `title` / `bodyText` | Active posts need a title; active comments need body. Body aliases: `body`, `selfText`. Maximum title 1,000 and body 20,000 characters |
| `createdAt` / `observedAt` | Required UTC date or Z timestamp; aliases `postedDate` / `scrapedAt`. Impossible/future dates and creation after observation are rejected |
| `subreddit` | Optional 3–21-character name, not URL; aliases `subredditName`, `communityName` |
| `score` or `upvotes` | Optional integer; negative scores remain negative. Supply one metric, never both; basis is retained |
| `declaredCommentCount` | Optional nonnegative post metric; aliases `totalComments`, `numberOfComments`. Unknown does not become zero |
| `parentCommentId` | Comment ID, or explicit null/empty for a known root comment. Omitting the field means unknown parent, not depth zero |
| `parentId` | Alternative parent fullname `t1_comment` or a matching `t3_post`; never combine with `parentCommentId` |
| `isNSFW` | Boolean; alias `over18`. Default filtering requires a safe flag or a safe supplied root for comments |
| `contentState` | `active`, `deleted` or `removed`. Latest deleted/removed states suppress the ID and earlier supplied content |

Do not provide duplicate aliases for one column. Missing optional metrics remain null. Numeric IDs, fractional scores, ranges, formulae and `12K` shorthand are rejected. Unsupported columns are dropped, not exported. Account deletion in an author column is not treated as deletion of the post itself.

CSV example, also invented:

```csv
recordType,postId,commentId,title,bodyText,createdAt,observedAt,parentCommentId,score,declaredCommentCount,isNSFW
post,demo001,,What tool can replace AtlasApp?,I wish we had exports.,2026-10-10,2026-10-12,,20,1,false
comment,demo001,reply01,,Please add CSV exports.,2026-10-11,2026-10-12,,-2,,false
```

## Selection, comparisons and data quality

Imports are bounded to **2 MiB**, **1,000 observations**, **40 columns per observation** and **500 unique IDs**. `maxRecords` defaults to 100, ranges 1–500 and applies to posts and comments **combined**. Full validation occurs before selection or saving; a conflicting same-ID/same-time observation beyond the cap still fails the input.

The whole stored Actor INPUT is additionally limited to **6 MiB including JSON/encryption overhead** and must be valid UTF-8 JSON, not JSON5. It is read as bytes through the current run's public Apify storage client, parsed natively and decrypted with Apify's official secret-input helper when configured. No arbitrary URL or alternative source is consulted. This avoids the large-export memory overhead of the local JSON5 input parser while retaining supported secret-input encryption.

Identical normalized snapshots are deduplicated. Several different times for an ID become one saved record containing its observations. The latest supplied text drives cues and mentions. For changes, the earliest earlier observation within `comparisonWindowDays` (default 30; 1–365) is compared with the latest one. No history is persisted across runs.

Selection uses first-seen eligible IDs. Caps and spending limits can omit comments, parents or roots; check `RUN_STATUS` and `QUALITY.csv` before interpreting results. A parent depth is derived only from supplied relationships. Ratios use comments having an observation at the root's supplied time and that root's declared count; an unknown/zero denominator or overcount is not repaired with invented values. Stale comment times are flagged.

A question without saved comment records means only **no comments in this saved selection**. It is not a live unanswered thread, an outreach opportunity or a current trend.

## Outputs and CSV research workflow

| Artifact | Use |
| --- | --- |
| `RUN_STATUS` | Mode, saved/omitted/excluded counts, complete/partial status, confirmed event counters and delivery warnings |
| `REPORT` | Selected normalized records, supplied snapshots and full analysis JSON |
| `INSIGHTS.csv` | Phrase cues, literal mentions, redacted excerpts and supplied parent depth |
| `THREADS.csv` | Saved thread evidence, time/count mismatches and question-without-supplied-comment flag |
| `MENTIONS.csv` | Per-record literal term comparisons in the supplied selection |
| `CHANGES.csv` | Bounded supplied score/count/text comparisons with limitations |
| `QUALITY.csv` | Missing evidence and relationship-quality warnings |
| `REPORT.md` | Readable summary with synthetic/source and method labels |

First check status/provenance, then review quality warnings. Filter insights by phrase cue and read the authorized original context separately where your license permits. Compare mentions only within a consistent supplied selection; join snapshot differences by `recordKey` and inspect the from/to times and metric basis. Treat these outputs as research aids for human review, not decision-ready customer intent or a representative market sample.

CSV cells with formula-like prefixes are escaped, including negative-value cells. Some spreadsheet programs therefore read negative metrics as text; explicitly convert trusted numeric columns if needed. The full dataset stores numeric scores. Protect every exported file under your source license.

## Fees and spending controls

Pricing is **$2/1,000 confirmed saved imported post/comment analyses plus $0.001 automatic Actor Start per run**. Platform usage is included under this pricing. There is **no additional dataset-item fee or tier discount**. Always check the current Apify pricing panel before starting.

The retained event IDs are `post-scraped` and `comment-scraped`, but their meaning here is **a confirmed saved imported analysis**, not live collection. One unique ID includes its supplied observations and research reports. Duplicates, omitted IDs and separate report files do not create extra result events.

| Successfully saved selection | Listed fee, including start |
| --- | --- |
| Synthetic demo: zero saved imported records | $0.001 |
| One imported post or comment | $0.003 |
| 100 imported posts/comments combined | $0.201 |

The **$0.003 minimum spending-cap setting** is the lowest allowed user budget setting, **not an additional fee or minimum actual charge**. A demo still charges only $0.001. A cap of $0.003 permits the start event and one saved imported analysis; further eligible records are omitted with an explicit partial status.

The runtime checks both the configured spending cap and SDK limits before each save, including an explicit zero-dollar cap. Private/non-PPE runs save without inventing custom event fees. If a save/charge acknowledgment is uncertain, there is **no automatic retry**: the run fails, warns that a row or charge may already have persisted, and reports only confirmed rows. A report-write failure also fails the run; previously saved records may still retain applicable fees. A spending-cap stop has an explicit partial-output status.

No source/proxy/AI charges are requested by this runtime. The automatic start event is controlled by Apify and is not waived by an empty dataset or failed import. Validation failures can therefore still incur the start fee. Successfully saved records can retain their applicable fees if a later save/report step fails.

The release uses **256 MB** with a **90-second default timeout**. Eleven approved private cloud checks verified the three demo presets, JSON/CSV imports, encrypted near-2 MiB histories and actual start/result/cap billing. Maximum observed cloud memory was about 48.3 MiB. A 500-record/1,000-observation case was checked locally, not at that scale in the cloud. These checks do not guarantee availability or profit for every workload, failed run or future platform change.

## Privacy, source rights and retention

Do not submit private messages, private/quarantined-community content, sexually explicit content, credentials, personal profiles or data for surveillance, sensitive-group targeting or harassment. Use only material licensed for this processing and any resulting reports. This Actor's rights confirmation **does not verify or grant authorization**.

Author/profile columns are not retained. Common identifying/credential patterns in title/body/provider labels are redacted, but pattern matching is **not complete anonymization**: names, unusual identifiers, post IDs or context may still identify someone. Review and minimize inputs before uploading. The original input can remain in the run's key-value store according to Apify storage settings; dropping output columns does not erase INPUT.

Latest supplied deletion markers and `removedRecordKeys` suppress this run's records and their supplied history. The Actor does not detect fresh Reddit deletions or delete older runs, downloaded files or prior reports. Maintain your license-required deletion feed and promptly purge affected historical copies yourself. See [Reddit Public Content Policy](https://support.reddithelp.com/hc/en-us/articles/26410290525844-Public-Content-Policy).

Independent tool; not affiliated with or endorsed by Reddit. Apache-2.0 covers this code, **not rights to imported content**.

## Migration from the old collector

Remove old subreddit, keyword, URL, sort, pagination, proxy and API/AI credential fields. They are rejected with `LEGACY_INPUT_RETIRED`, before any Reddit lookup or result write. Choose an explicit synthetic demo or migrate to an authorized export. Do not expect old saved tasks or live-collection workflows to continue.

This scope change is disclosed rather than presented as a working live scraper. No duplicate Actor/account, transferred reputation, fake runs or artificial reviews are part of this upgrade.

## Local verification

Node.js 20 or newer:

```text
npm ci
npm test
npm run lint
npm run audit:prod
apify validate-schema
```

No source collection is required by those tests. Release gates additionally check compiled Actor reports, synthetic labeling, result/budget acknowledgments, memory headroom and measured economics on an explicitly approved staging build. Local success alone is not a cloud reliability or legal-compliance guarantee.
