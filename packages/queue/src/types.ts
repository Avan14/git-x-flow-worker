// Job data types
export interface TwitterPostJobData {
    scheduledPostId: string;
    userId: string;
    contentId: string;
    platform: 'twitter';
    content: string;
    mediaUrls?: string[];
    priority: number;
}

export interface LinkedInPostJobData {
    scheduledPostId: string;
    userId: string;
    contentId: string;
    platform: 'linkedin';
    content: string;
    mediaUrls?: string[];
    priority: number;
}

export type PostJobData = TwitterPostJobData | LinkedInPostJobData;

// Job result types
export interface JobResult {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: JobError;
}

export interface JobError {
    code: string;
    message: string;
    retryable: boolean;
}

// Job status types
export type JobStatus =
    | 'waiting'
    | 'delayed'
    | 'active'
    | 'completed'
    | 'failed';

// Queue metrics
export interface QueueMetrics {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}
