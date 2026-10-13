export type RecordType = 'post' | 'comment';
export type DemoPreset = 'us-saas-research' | 'us-brand-comparison' | 'us-thread-quality';
export type Signal = 'pain-point-phrase' | 'feature-request-phrase' | 'recommendation-question' | 'switching-phrase' | 'pricing-question' | 'question';
export interface ResearchInput {
    mode: 'demo' | 'import'; demoPreset: DemoPreset; maxRecords: number; skipNSFW: boolean;
    watchTerms: string[]; comparisonWindowDays: number; removedRecordKeys: string[];
}
export interface Observation {
    recordKey: string; recordType: RecordType; postId: string; commentId: string | null;
    subreddit: string | null; title: string | null; bodyText: string | null;
    createdAt: string; observedAt: string; score: number | null; scoreBasis: 'reported-score' | 'reported-upvotes' | null;
    declaredCommentCount: number | null; parentCommentId: string | null; parentKnown: boolean;
    isNSFW: boolean | null; contentState: 'active' | 'deleted' | 'removed';
}
export interface ResearchRecord {
    recordKey: string; recordType: RecordType; postId: string; commentId: string | null;
    subreddit: string | null; title: string | null; bodyText: string | null;
    createdAt: string; observedAt: string; score: number | null; scoreBasis: Observation['scoreBasis'];
    declaredCommentCount: number | null; parentCommentId: string | null; parentKnown: boolean; isNSFW: boolean | null;
    observations: Observation[]; signals: Signal[]; mentions: string[];
    source: 'authorized-export' | 'synthetic-demo'; isSynthetic: boolean; dataProvider: string; importedAt: string;
    sourceRightsVerified: false; liveSourceVerified: false; authorFieldsIncluded: false;
}
export interface ImportPlan {
    records: ResearchRecord[]; allEligibleKeys: string[]; inputRows: number; normalizedObservations: number;
    duplicateObservations: number; excludedDeletedRecords: number; excludedNSFWRecords: number;
    excludedRemovedThreadRecords: number; eligibleRecords: number; omittedRecords: number; unsupportedColumnsDropped: number;
    dataProvider: string;
}
export interface SaveAcknowledgment { chargedCount: number; eventChargeLimitReached: boolean; }
