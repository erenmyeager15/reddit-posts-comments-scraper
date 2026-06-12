# Reddit Scraper - Posts & Comments (No API Key)

Scrape **Reddit posts and comments** from any subreddit, search query, or post URL - no login, no API key, no Reddit app required. Extract titles, body text, upvotes, upvote ratio, authors, flair, awards, and full nested comment threads. Export to **JSON, CSV, Excel, or HTML**, or pull via the Apify API.

Perfect for **market research, sentiment analysis, brand monitoring, content research, and AI/LLM training data**.

## Features

- ✅ **No login or API key** - uses Reddit's public JSON endpoints
- ✅ **Three input modes** - subreddits, search keywords, or direct post URLs
- ✅ **Posts + comments** - full post metadata plus nested comment threads with depth
- ✅ **Sort & filter** - hot / new / top / rising, time filters, NSFW skip
- ✅ **Automatic pagination** - scrape from a handful of posts up to thousands
- ✅ **Fast & lightweight** - pure HTTP/JSON, no headless browser
- ✅ **Clean structured output** - separate Posts and Comments dataset views

## Input

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `subreddits` | `string[]` | Subreddit names (no `r/` prefix), e.g. `"programming"` | `["programming"]` |
| `keywords` | `string[]` | Reddit search keywords | `[]` |
| `postUrls` | `string[]` | Direct Reddit post URLs | `[]` |
| `sortBy` | `string` | `hot`, `new`, `top`, `rising` | `hot` |
| `timeFilter` | `string` | For `top`: `hour`/`day`/`week`/`month`/`year`/`all` | `all` |
| `maxPostsPerSubreddit` | `integer` | Max posts per source | `50` |
| `maxCommentsPerPost` | `integer` | Max comments per post (`0` = skip comments) | `10` |
| `skipNSFW` | `boolean` | Exclude NSFW posts | `true` |
| `proxyConfiguration` | `object` | Proxy (residential strongly recommended) | Apify Residential |

### Example input

```json
{
  "subreddits": ["technology", "programming"],
  "sortBy": "top",
  "timeFilter": "week",
  "maxPostsPerSubreddit": 100,
  "maxCommentsPerPost": 20,
  "skipNSFW": true,
  "proxyConfiguration": { "useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"] }
}
```

## Sample output

### Post

```json
{
  "postId": "1abc2def",
  "title": "What programming language should I learn in 2026?",
  "bodyText": "I'm a beginner looking to break into software development...",
  "postUrl": "https://www.reddit.com/r/programming/comments/1abc2def/...",
  "subredditName": "programming",
  "authorUsername": "code_newbie_42",
  "upvotes": 342,
  "upvoteRatio": 95,
  "totalComments": 87,
  "awardsCount": 2,
  "postedDate": "2026-01-15T14:30:00.000Z",
  "postType": "text",
  "linkUrl": null,
  "flairText": "Discussion",
  "isNSFW": false,
  "scrapedAt": "2026-06-11T10:00:00.000Z"
}
```

### Comment

```json
{
  "commentId": "xyz789",
  "postId": "1abc2def",
  "bodyText": "I'd recommend Python for beginners...",
  "authorUsername": "senior_dev_pro",
  "upvotes": 156,
  "postedDate": "2026-01-15T15:45:00.000Z",
  "parentCommentId": null,
  "depth": 0,
  "scrapedAt": "2026-06-11T10:00:00.000Z"
}
```

The dataset has two ready-made views in the console: **Posts** and **Comments**.

## Pricing

This Actor uses **pay-per-result** pricing:

| Event | Price |
|-------|-------|
| Per post scraped | **$0.002** ($2 / 1,000 posts) |
| Per comment scraped | **$0.002** ($2 / 1,000 comments) |

Set `maxCommentsPerPost: 0` to scrape posts only. You are only charged for items actually extracted. Apify platform usage and proxy traffic are billed separately by Apify.

## Use cases

- **Market & product research** - track discussions, feature requests, and competitor mentions
- **Sentiment analysis & AI training** - collect large volumes of posts/comments for NLP
- **Brand monitoring** - find mentions of your brand across subreddits
- **Content research** - discover trending topics and high-performing formats
- **Academic research** - structured social datasets with engagement metrics

## Tips

- Reddit blocks datacenter IPs on its JSON endpoints - keep **residential proxies** enabled.
- Use `top` + `timeFilter: "week"` for trending content; `new` for real-time monitoring.
- Set `maxCommentsPerPost: 0` to scrape posts only and cut cost.

## Responsible Use

This Actor is intended for lawful collection of publicly available information only. Users are responsible for ensuring their use complies with the source website's terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. The Actor author is not responsible for misuse by end users.

## License

Apache-2.0
