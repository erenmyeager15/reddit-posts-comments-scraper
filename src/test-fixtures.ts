export const NOW = new Date('2026-10-13T00:00:00Z');
export const POST = { recordType: 'post', postId: 'abc123', title: 'AtlasApp is too slow; any recommendations?',
    bodyText: 'I wish AtlasApp had exports. Is the price worth it?', subreddit: 'synthetic_saas_lab',
    createdAt: '2026-10-10', observedAt: '2026-10-12', score: 20, declaredCommentCount: 2, isNSFW: false };
export const COMMENT = { recordType: 'comment', postId: 'abc123', commentId: 'reply01',
    bodyText: 'Please add CSV exports. NimbusApp is an alternative to AtlasApp.', subreddit: 'synthetic_saas_lab',
    createdAt: '2026-10-11', observedAt: '2026-10-12', score: -2, parentCommentId: null, isNSFW: false };
export const REPLY = { ...COMMENT, commentId: 'reply02', parentCommentId: 'reply01', bodyText: 'I struggle with setup.' };
export function importInput(rows: unknown[], extra: Record<string, unknown> = {}) {
    return { mode: 'import', authorizedData: true, importSource: 'Owner-authored synthetic QA, not Reddit data',
        importJson: JSON.stringify(rows), watchTerms: ['AtlasApp', 'NimbusApp'], ...extra };
}
