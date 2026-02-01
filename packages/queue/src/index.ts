import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import type { ConnectionOptions, JobsOptions } from 'bullmq';
import type { TwitterPostJobData, JobResult } from './types';

// Redis connection config
export const getConnection = (): ConnectionOptions => ({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
});

// Queue names
export const QUEUE_NAMES = {
    TWITTER_POST: 'twitter-post',
    LINKEDIN_POST: 'linkedin-post',
} as const;

// Default job options
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 60000,
    },
    removeOnComplete: {
        age: 86400,
        count: 1000,
    },
    removeOnFail: {
        age: 604800,
        count: 5000,
    },
};

// Job priority presets
export const JOB_PRIORITY = {
    HIGH: 1,
    NORMAL: 5,
    LOW: 10,
} as const;

// Create Twitter post queue
export function createTwitterQueue(): Queue<TwitterPostJobData> {
    return new Queue(QUEUE_NAMES.TWITTER_POST, {
        connection: getConnection(),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
}

// Create Twitter worker
export function createTwitterWorker(
    processor: (job: Job<TwitterPostJobData>) => Promise<JobResult>,
    concurrency: number = 5
): Worker<TwitterPostJobData, JobResult> {
    return new Worker(QUEUE_NAMES.TWITTER_POST, processor, {
        connection: getConnection(),
        concurrency,
        limiter: {
            max: 10,
            duration: 60000,
        },
    });
}

// Create queue events listener
export function createQueueEvents(queueName: string): QueueEvents {
    return new QueueEvents(queueName, {
        connection: getConnection(),
    });
}

// Re-export types
export type { Job, Queue, Worker, QueueEvents, JobsOptions };
export * from './types';
