export interface ActorInput {
    subreddits?: string[];
    keywords?: string[];
    postUrls?: string[];
    sortBy?: 'hot' | 'new' | 'top' | 'rising';
    timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    maxPostsPerSubreddit?: number;
    maxCommentsPerPost?: number;
    skipNSFW?: boolean;
    proxyConfiguration?: {
        useApifyProxy?: boolean;
        apifyProxyGroups?: string[];
        proxyUrls?: string[];
    };
}

export interface PostRecord {
    postId: string;
    title: string | null;
    bodyText: string | null;
    postUrl: string;
    subredditName: string | null;
    authorUsername: string | null;
    authorKarma: number | null;
    upvotes: number | null;
    upvoteRatio: number | null;
    totalComments: number | null;
    awardsCount: number | null;
    postedDate: string | null;
    postType: string | null;
    linkUrl: string | null;
    thumbnailUrl: string | null;
    flairText: string | null;
    isPinned: boolean;
    isSpoiler: boolean;
    isNSFW: boolean;
    crosspostCount: number | null;
    scrapedAt: string;
}

export interface CommentRecord {
    commentId: string;
    postId: string;
    bodyText: string | null;
    authorUsername: string | null;
    upvotes: number | null;
    postedDate: string | null;
    parentCommentId: string | null;
    depth: number;
    isGilded: boolean;
    isEdited: boolean;
    scrapedAt: string;
}

export type SortByOption = 'hot' | 'new' | 'top' | 'rising';

export type TimeFilterOption = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
