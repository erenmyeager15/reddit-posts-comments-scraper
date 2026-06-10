import { Actor, log } from 'apify';
import { HttpCrawler } from 'crawlee';
import type { ActorInput } from './types.js';
import { buildRouter } from './routes.js';

await Actor.init();

const input = ((await Actor.getInput<ActorInput>()) ?? {}) as ActorInput;

const {
    subreddits = [],
    keywords = [],
    postUrls = [],
    sortBy = 'hot',
    timeFilter = 'all',
    maxPostsPerSubreddit = 50,
    maxCommentsPerPost = 10,
    skipNSFW = true,
    proxyConfiguration: proxyInput,
} = input;

const cleanSubs = subreddits.map((s) => s.replace(/^\/?r\//i, '').replace(/\/+$/, '').trim()).filter(Boolean);
const cleanKeywords = keywords.map((k) => k.trim()).filter(Boolean);
const cleanPostUrls = postUrls.map((u) => u.trim()).filter(Boolean);

if (cleanSubs.length === 0 && cleanKeywords.length === 0 && cleanPostUrls.length === 0) {
    log.error('No input provided. Add at least one subreddit, keyword, or post URL.');
    await Actor.exit();
}

// Reddit blocks datacenter IPs on its public JSON endpoints, so residential proxies with
// session rotation are required. Default to Apify residential proxies.
const proxyConfiguration = await Actor.createProxyConfiguration(
    proxyInput ?? { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
);

/** Convert a Reddit post URL to its JSON endpoint. */
function toPostJsonUrl(raw: string): string | null {
    try {
        const u = new URL(raw.replace('old.reddit.com', 'www.reddit.com'));
        if (!/reddit\.com$/.test(u.hostname.replace(/^www\./, ''))) return null;
        const path = u.pathname.replace(/\/+$/, '');
        return `https://www.reddit.com${path}.json?raw_json=1&limit=500`;
    } catch {
        return null;
    }
}

function listingUrl(sub: string): string {
    const base = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${sortBy}.json?raw_json=1&limit=100`;
    return sortBy === 'top' ? `${base}&t=${timeFilter}` : base;
}

function searchUrl(keyword: string): string {
    const params = new URLSearchParams({ q: keyword, sort: sortBy === 'rising' ? 'hot' : sortBy, limit: '100', raw_json: '1', type: 'link' });
    if (sortBy === 'top') params.set('t', timeFilter);
    return `https://www.reddit.com/search.json?${params.toString()}`;
}

const startRequests = [
    ...cleanSubs.map((sub) => ({
        url: listingUrl(sub),
        userData: { label: 'LISTING' as const, source: `r/${sub}`, collected: 0 },
    })),
    ...cleanKeywords.map((kw) => ({
        url: searchUrl(kw),
        userData: { label: 'LISTING' as const, source: `search:${kw}`, collected: 0 },
    })),
    ...cleanPostUrls
        .map((u) => ({ json: toPostJsonUrl(u), raw: u }))
        .filter((x) => x.json)
        .map((x) => ({
            url: x.json as string,
            userData: { label: 'POST' as const, source: x.raw, pushPost: true },
        })),
];

const router = buildRouter({ maxPostsPerSubreddit, maxCommentsPerPost, skipNSFW, sortBy, timeFilter });

const crawler = new HttpCrawler({
    proxyConfiguration,
    requestHandler: router,
    additionalMimeTypes: ['application/json', 'text/html'],
    maxConcurrency: 10,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 90,
    retryOnBlocked: true,
    sessionPoolOptions: {
        maxPoolSize: 100,
        sessionOptions: { maxUsageCount: 8 },
    },
    failedRequestHandler: async ({ request }, error) => {
        log.error(`Request failed after retries: ${request.url} - ${(error as Error)?.message ?? error}`);
    },
});

await crawler.run(startRequests);
log.info('Reddit scrape finished.');
await Actor.exit();
