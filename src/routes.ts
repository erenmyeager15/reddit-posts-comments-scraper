import { Actor, log } from 'apify';
import type { HttpCrawlingContext } from 'crawlee';
import type { CommentRecord, PostRecord } from './types.js';

interface RouterOpts {
    maxPostsPerSubreddit: number;
    maxCommentsPerPost: number;
    skipNSFW: boolean;
    sortBy: string;
    timeFilter: string;
}

const isoFromUtc = (utc: unknown): string | null =>
    typeof utc === 'number' && utc > 0 ? new Date(utc * 1000).toISOString() : null;

function parseBody(ctx: HttpCrawlingContext): any {
    const anyCtx = ctx as any;
    if (anyCtx.json !== undefined && anyCtx.json !== null) return anyCtx.json;
    const raw = ctx.body?.toString?.() ?? '';
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        // Not JSON -> almost always Reddit's IP block page. Trip a session error to rotate.
        throw new Error('Reddit returned a non-JSON (blocked) response. Rotating session.');
    }
    return JSON.parse(trimmed);
}

function mapPost(d: any): PostRecord {
    const isSelf = !!d.is_self;
    const thumb = typeof d.thumbnail === 'string' && d.thumbnail.startsWith('http') ? d.thumbnail : null;
    return {
        postId: d.id,
        title: d.title ?? null,
        bodyText: d.selftext ? String(d.selftext) : null,
        postUrl: d.permalink ? `https://www.reddit.com${d.permalink}` : (d.url ?? ''),
        subredditName: d.subreddit ?? null,
        authorUsername: d.author ?? null,
        authorKarma: null,
        upvotes: typeof d.ups === 'number' ? d.ups : (typeof d.score === 'number' ? d.score : null),
        upvoteRatio: typeof d.upvote_ratio === 'number' ? Math.round(d.upvote_ratio * 100) : null,
        totalComments: typeof d.num_comments === 'number' ? d.num_comments : null,
        awardsCount: typeof d.total_awards_received === 'number' ? d.total_awards_received : null,
        postedDate: isoFromUtc(d.created_utc),
        postType: isSelf ? 'text' : (d.post_hint ?? (d.is_video ? 'video' : 'link')),
        linkUrl: isSelf ? null : (d.url ?? null),
        thumbnailUrl: thumb,
        flairText: d.link_flair_text ? String(d.link_flair_text) : null,
        isPinned: !!(d.stickied || d.pinned),
        isSpoiler: !!d.spoiler,
        isNSFW: !!d.over_18,
        crosspostCount: typeof d.num_crossposts === 'number' ? d.num_crossposts : null,
        scrapedAt: new Date().toISOString(),
    };
}

function mapComment(d: any, postId: string, depth: number): CommentRecord {
    const parent = typeof d.parent_id === 'string' ? d.parent_id : '';
    const parentCommentId = parent.startsWith('t1_') ? parent.slice(3) : null;
    return {
        commentId: d.id,
        postId,
        bodyText: d.body ? String(d.body) : null,
        authorUsername: d.author ?? null,
        upvotes: typeof d.ups === 'number' ? d.ups : (typeof d.score === 'number' ? d.score : null),
        postedDate: isoFromUtc(d.created_utc),
        parentCommentId,
        depth,
        isGilded: !!d.gilded,
        isEdited: typeof d.edited === 'number' && d.edited > 0,
        scrapedAt: new Date().toISOString(),
    };
}

/** Depth-first flatten of a Reddit comment listing, capped at `limit` total comments. */
function flattenComments(children: any[], postId: string, depth: number, out: CommentRecord[], limit: number): void {
    for (const child of children) {
        if (out.length >= limit) return;
        if (child?.kind !== 't1' || !child.data) continue;
        const d = child.data;
        if (!d.body) continue;
        out.push(mapComment(d, postId, depth));
        const replies = d.replies;
        if (replies && typeof replies === 'object' && replies.data?.children?.length) {
            flattenComments(replies.data.children, postId, depth + 1, out, limit);
        }
    }
}

function withAfter(url: string, after: string, count: number): string {
    const u = new URL(url);
    u.searchParams.set('after', after);
    u.searchParams.set('count', String(count));
    return u.toString();
}

export function buildRouter(opts: RouterOpts) {
    const { maxPostsPerSubreddit, maxCommentsPerPost, skipNSFW } = opts;

    return async (ctx: HttpCrawlingContext): Promise<void> => {
        const { request, crawler } = ctx;
        const data = parseBody(ctx);
        const label = (request.userData.label as string) ?? 'LISTING';

        if (label === 'POST') {
            // data is [postListing, commentListing]
            const postListing = Array.isArray(data) ? data[0] : null;
            const commentListing = Array.isArray(data) ? data[1] : null;
            const postNode = postListing?.data?.children?.[0]?.data;
            const postId = postNode?.id ?? (request.userData.postId as string) ?? 'unknown';

            if (request.userData.pushPost && postNode) {
                await Actor.pushData({ ...mapPost(postNode), recordType: 'post' });
                await Actor.charge({ eventName: 'post-scraped' }).catch(() => null);
            }

            if (maxCommentsPerPost > 0 && commentListing?.data?.children?.length) {
                const comments: CommentRecord[] = [];
                flattenComments(commentListing.data.children, postId, 0, comments, maxCommentsPerPost);
                for (const c of comments) {
                    await Actor.pushData({ ...c, recordType: 'comment' });
                    await Actor.charge({ eventName: 'comment-scraped' }).catch(() => null);
                }
                log.info(`Post ${postId}: pushed ${comments.length} comments`);
            }
            return;
        }

        // LISTING (subreddit or search)
        const source = (request.userData.source as string) ?? 'reddit';
        let collected = (request.userData.collected as number) ?? 0;
        const children: any[] = data?.data?.children ?? [];
        const after: string | null = data?.data?.after ?? null;

        let pushedThisPage = 0;
        for (const child of children) {
            if (collected >= maxPostsPerSubreddit) break;
            if (child?.kind !== 't3' || !child.data) continue;
            const d = child.data;
            if (skipNSFW && d.over_18) continue;

            await Actor.pushData({ ...mapPost(d), recordType: 'post' });
            await Actor.charge({ eventName: 'post-scraped' }).catch(() => null);
            collected++;
            pushedThisPage++;

            if (maxCommentsPerPost > 0 && d.permalink) {
                await crawler.addRequests([
                    {
                        url: `https://www.reddit.com${d.permalink}.json?raw_json=1&limit=500`,
                        userData: { label: 'POST', postId: d.id, pushPost: false },
                    },
                ]);
            }
        }

        log.info(`${source}: pushed ${pushedThisPage} posts (total ${collected}/${maxPostsPerSubreddit})`);

        if (collected < maxPostsPerSubreddit && after) {
            await crawler.addRequests([
                {
                    url: withAfter(request.url, after, collected),
                    userData: { label: 'LISTING', source, collected },
                },
            ]);
        }
    };
}
