import type { DemoPreset } from './types.js';

const post = { recordType: 'post', postId: 'demo001', title: 'What tool can replace AtlasApp?', bodyText: 'AtlasApp is too slow. I wish we had better exports. Any recommendations?',
    subreddit: 'synthetic_saas_lab', createdAt: '2026-10-10', observedAt: '2026-10-12', score: 20, declaredCommentCount: 4, isNSFW: false };
const comment = { recordType: 'comment', postId: 'demo001', commentId: 'reply01', bodyText: 'Please add CSV exports. I use NimbusApp for this workflow.',
    subreddit: 'synthetic_saas_lab', createdAt: '2026-10-11', observedAt: '2026-10-12', score: 5, isNSFW: false, parentCommentId: null };
export function demoRows(preset: DemoPreset): Record<string, unknown>[] {
    if (preset === 'us-saas-research') return [post, comment,
        { ...comment, commentId: 'reply02', parentCommentId: 'reply01', bodyText: 'Can anyone recommend an alternative to AtlasApp? How much is the price?', score: -2 }];
    if (preset === 'us-brand-comparison') return [post,
        { ...comment, bodyText: 'NimbusApp works for exports; AtlasApp works for notes.' },
        { ...post, postId: 'demo002', title: 'NimbusApp feature request', bodyText: 'I wish NimbusApp had better onboarding.', declaredCommentCount: 0 }];
    return [{ ...post, observedAt: '2026-10-11', score: 10, declaredCommentCount: 2 }, post, comment,
        { ...comment, commentId: 'reply02', parentCommentId: 'missing1', bodyText: 'The supplied parent is missing from this invented export.' },
        { ...comment, commentId: 'reply03', parentCommentId: 'reply04', bodyText: 'Invented cycle example A.' },
        { ...comment, commentId: 'reply04', parentCommentId: 'reply03', bodyText: 'Invented cycle example B.' },
        { ...comment, commentId: 'reply05', observedAt: '2026-10-11', bodyText: 'Different snapshot time, not complete current coverage.' }];
}
